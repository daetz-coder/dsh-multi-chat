import { execFile, spawn } from "node:child_process";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import z from "@deepseek-ai/schemastery";
import { connect, createServer } from "node:net";
//#region lib/types/gateway.js
/**
* Inline authenticated gateway for the multi-wall plugin's node half.
*
* The official `dsh web` CLI forbids `--host 0.0.0.0` (it would expose remote
* code execution to the network), so reaching a loopback-only DSH instance
* from a phone/another machine needs an auth-gated gateway in front of it.
*
* This module embeds that gateway directly in the plugin (no external
* `gateway.mjs` file needed at runtime): a raw TCP listener that authenticates
* a token (HMAC-signed session cookie), then transparently proxies to
* `127.0.0.1:<target-port>`, rewriting Host/Origin so the official `/api`
* browser-trust fence treats it as a local request. WebSocket upgrades pass
* through untouched because the socket is piped byte-for-byte after the head.
*
* Zero dependencies: node:net + node:crypto only.
* @module @deepseek-ai/dsh-client-ui-multi-wall/gateway
*/
/** Constant-time hex string comparison (length-guarded). */
function safeEqualHex(left, right) {
	const a = Buffer.from(left, "hex");
	const b = Buffer.from(right, "hex");
	return a.length !== 0 && a.length === b.length && timingSafeEqual(a, b);
}
/** Minimal HTTP/1.1 head parse; null until the head is complete. */
function parseHead(buffer) {
	const idx = buffer.indexOf("\r\n\r\n");
	if (idx === -1) return null;
	const lines = buffer.subarray(0, idx + 4).toString("latin1").split("\r\n");
	const requestLine = lines[0]?.match(/^(\S+)\s+(\S+)\s+(HTTP\/\d\.\d)$/);
	const headers = [];
	const map = {};
	for (const line of lines.slice(1)) {
		const ci = line.indexOf(":");
		if (ci === -1) continue;
		const name = line.slice(0, ci).trim().toLowerCase();
		const value = line.slice(ci + 1).trim();
		map[name] = value;
		headers.push([name, value]);
	}
	return {
		malformed: requestLine === null,
		headBytes: idx + 4,
		method: requestLine?.[1] ?? "",
		target: requestLine?.[2] ?? "",
		version: requestLine?.[3] ?? "",
		headers,
		map
	};
}
/** Pathname of a request target (defaults to '/' on parse failure). */
function targetPath(target) {
	try {
		return new URL(target, "http://gateway.local").pathname;
	} catch {
		return "/";
	}
}
/** The dark-themed login page. */
function loginPage(name, next) {
	return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name} · 访问认证</title>
<style>
  body { font-family: system-ui, sans-serif; background:#0d1117; color:#e6edf3;
         display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
  form { background:#161b22; border:1px solid #30363d; border-radius:12px;
         padding:32px 36px; width:min(320px, 90vw); box-shadow:0 8px 30px #0006; }
  h1 { font-size:16px; margin:0 0 18px; font-weight:600; }
  label { font-size:13px; color:#8b949e; }
  input { width:100%; box-sizing:border-box; margin:6px 0 16px; padding:9px 10px;
          border-radius:8px; border:1px solid #30363d; background:#0d1117; color:#e6edf3; font-size:14px; }
  button { width:100%; padding:10px; border:none; border-radius:8px; background:#2f81f7;
           color:#fff; font-size:14px; font-weight:600; cursor:pointer; }
  button:hover { background:#388bfd; }
</style>
</head>
<body>
<form method="post" action="/__gw__/login">
  <h1>${name} · 需要访问口令</h1>
  <label for="token">访问口令</label>
  <input id="token" name="token" type="password" autofocus autocomplete="current-password">
  <input type="hidden" name="next" value="${(next ?? "").replace(/"/g, "&quot;")}">
  <button type="submit">进入</button>
</form>
</body>
</html>`;
}
/** Send the login page as a 401 HTML response. */
function respondLogin(socket, name, next) {
	const body = Buffer.from(loginPage(name, next), "utf8");
	socket.write(`HTTP/1.1 401 Unauthorized\r
content-type: text/html; charset=utf-8\r
content-length: ${body.length}\r\nconnection: close\r
cache-control: no-store\r
\r
`);
	socket.write(body);
	socket.end();
}
/** Send a small plain-text response and close the socket. */
function respondPlain(socket, status, text) {
	const body = Buffer.from(text, "utf8");
	socket.write(`HTTP/1.1 ${status}\r\ncontent-type: text/plain; charset=utf-8\r
content-length: ${body.length}\r\nconnection: close\r
cache-control: no-store\r
\r
`);
	socket.write(body);
	socket.end();
}
/**
* Rebuild the request head for the loopback target. Host and Origin point at
* `127.0.0.1:<target-port>` so the DSH `/api` browser-trust fence sees a local
* request. Non-upgrade requests get `connection: close` (fresh connection per
* request keeps keep-alive from smuggling unrewritten Host headers); upgrades
* (WebSocket) keep `connection: Upgrade`.
*/
function rewriteHead(parsed, targetPort) {
	const upgrade = parsed.map.upgrade !== void 0;
	const lines = [`${parsed.method} ${parsed.target} ${parsed.version}`];
	for (const [name, value] of parsed.headers) if (name === "host") lines.push(`host: 127.0.0.1:${targetPort}`);
	else if (name === "origin") lines.push(`origin: http://127.0.0.1:${targetPort}`);
	else if (name === "connection" || name === "proxy-connection") {} else lines.push(`${name}: ${value}`);
	lines.push(upgrade ? "connection: Upgrade" : "connection: close");
	return lines.join("\r\n") + "\r\n\r\n";
}
/**
* Start an in-process authenticated gateway for one loopback DSH instance.
* @param options - target, listen port, token, label, and lifetime.
* @returns a handle with the assigned port and token, and a close().
*/
function startGateway(options) {
	const { targetPort, port: requestedPort, token, name, maxAgeHours = 12, log = () => {} } = options;
	const hmac = (data) => createHmac("sha256", token).update(data).digest("hex");
	const signSession = (exp) => {
		const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
		return `${payload}.${hmac(payload)}`;
	};
	const verifySession = (value) => {
		const dot = value.lastIndexOf(".");
		if (dot <= 0) return false;
		const payload = value.slice(0, dot);
		if (!safeEqualHex(value.slice(dot + 1), hmac(payload))) return false;
		try {
			const parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
			return typeof parsed.exp === "number" && parsed.exp > Date.now();
		} catch {
			return false;
		}
	};
	const isAuthed = (parsed) => {
		const cookie = parsed.map.cookie ?? "";
		const session = /(?:^|;\s*)dsh_gw_session=([^;]+)/.exec(cookie);
		if (session !== null && verifySession(session[1] ?? "")) return true;
		const bearer = parsed.map.authorization ?? "";
		if (bearer.startsWith("Bearer ") && bearer.slice(7) === token) return true;
		try {
			return new URL(parsed.target, "http://gateway.local").searchParams.get("token") === token;
		} catch {
			return false;
		}
	};
	const attempts = /* @__PURE__ */ new Map();
	const isBlocked = (ip) => {
		const entry = attempts.get(ip);
		return entry !== void 0 && entry.blockedUntil !== void 0 && entry.blockedUntil > Date.now();
	};
	const registerFailure = (ip) => {
		const now = Date.now();
		const entry = attempts.get(ip) ?? { fails: 0 };
		if (entry.blockedUntil !== void 0 && entry.blockedUntil > now) return;
		entry.fails += 1;
		if (entry.fails >= 5) {
			entry.fails = 0;
			entry.blockedUntil = now + 6e4;
			log(`rate-limited ${ip} for 60s`);
		}
		attempts.set(ip, entry);
		if (attempts.size > 512) {
			for (const [key, value] of attempts) if (value.fails === 0 && value.blockedUntil === void 0) attempts.delete(key);
		}
	};
	const handleLogin = (socket, parsed, initialBody) => {
		let next = "/";
		try {
			next = new URL(parsed.target, "http://gateway.local").searchParams.get("next") ?? "/";
		} catch {}
		if (!/^\/(?!\/)/.test(next)) next = "/";
		if (parsed.method !== "POST") {
			respondLogin(socket, name, next);
			return;
		}
		const ip = socket.remoteAddress ?? "unknown";
		if (isBlocked(ip)) {
			respondPlain(socket, "429", "too many login attempts, try again later");
			return;
		}
		const contentLength = Number(parsed.map["content-length"] ?? 0);
		if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > 16384) {
			respondPlain(socket, "413", "login body too large");
			return;
		}
		let collected = Buffer.from(initialBody);
		const done = () => {
			socket.off("data", onBody);
			if ((new URLSearchParams(collected.toString("utf8")).get("token") ?? "") === token) {
				const cookie = `dsh_gw_session=${signSession(Date.now() + maxAgeHours * 36e5)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeHours * 3600}`;
				socket.write(`HTTP/1.1 302 Found\r
location: ${next}\r\nset-cookie: ${cookie}\r\ncontent-length: 0\r
connection: close\r
\r
`);
				socket.end();
				log(`login ok from ${ip}`);
			} else {
				registerFailure(ip);
				log(`login FAILED from ${ip}`);
				respondLogin(socket, name, next);
			}
		};
		const onBody = (chunk) => {
			collected = Buffer.concat([collected, chunk]);
			if (collected.length >= contentLength) done();
		};
		if (collected.length >= contentLength) done();
		else {
			socket.on("data", onBody);
			socket.once("end", done);
		}
	};
	const handleSocket = (socket) => {
		let buffer = Buffer.alloc(0);
		let headDone = false;
		let proxying = false;
		const onData = (chunk) => {
			if (headDone) return;
			buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk]);
			if (buffer.length > 65536) {
				headDone = true;
				respondPlain(socket, "431", "request head too large");
				return;
			}
			const parsed = parseHead(buffer);
			if (parsed === null) return;
			headDone = true;
			if (parsed.malformed) {
				respondPlain(socket, "400", "malformed request");
				return;
			}
			const path = targetPath(parsed.target);
			if (path === "/__gw__/login") {
				handleLogin(socket, parsed, buffer.subarray(parsed.headBytes));
				return;
			}
			if (!isAuthed(parsed)) {
				respondLogin(socket, name, path === "/" ? "/" : path);
				return;
			}
			const target = connect(targetPort, "127.0.0.1");
			const rest = buffer.subarray(parsed.headBytes);
			let connected = false;
			target.on("connect", () => {
				connected = true;
				target.write(rewriteHead(parsed, targetPort));
				if (rest.length > 0) target.write(rest);
				proxying = true;
				socket.pipe(target);
				target.pipe(socket);
			});
			target.on("error", (error) => {
				if (!connected) respondPlain(socket, "502", `cannot reach target 127.0.0.1:${targetPort}: ${error.message}`);
				socket.destroy();
			});
			socket.on("error", () => target.destroy());
			socket.on("close", () => {
				if (proxying) target.destroy();
			});
		};
		socket.on("data", onData);
		socket.on("error", () => {
			socket.destroy();
		});
	};
	return new Promise((resolve, reject) => {
		const server = createServer(handleSocket);
		server.once("error", reject);
		server.listen(requestedPort, "0.0.0.0", () => {
			server.removeListener("error", reject);
			const address = server.address();
			const assignedPort = typeof address === "object" && address !== null ? address.port : requestedPort;
			log(`gateway listening 0.0.0.0:${assignedPort} -> 127.0.0.1:${targetPort}`);
			resolve({
				port: assignedPort,
				token,
				close: () => {
					server.close();
				}
			});
		});
	});
}
//#endregion
//#region lib/types/index.js
/**
* Multi-window wall plugin, node half: registers the `/multi/api/*` routes
* on the webserver. The browser half fetches these same-origin to discover
* which local ports are live DSH instances, to poll liveness, and to
* terminate a chosen instance (`/multi/api/stop`). The wall itself is pure
* UI — this half answers a few small JSON requests.
* @module @deepseek-ai/dsh-client-ui-multi-wall
*/
/** Stable Cordis plugin name. */
const name = "client-ui-multi-wall";
/** Services required before the probe routes can be registered. */
const inject = ["webServer"];
/** Schema-validated config (the Loader resolves defaults for absent keys). */
const Config = z.object({
	scanFrom: z.natural().default(3070),
	scanTo: z.natural().default(3110),
	ports: z.array(z.natural()).default([]),
	publicUrl: z.string().default(""),
	gatewayPort: z.number().default(0),
	gatewayToken: z.string().default("")
});
/** MIME for JSON probe answers. */
const JSON_TYPE = "application/json; charset=utf-8";
/** GET one local URL with a short timeout; resolve {status, body} or reject. */
async function request(url, timeoutMs = 600) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(url, { signal: controller.signal });
		return {
			status: res.status,
			body: await res.text()
		};
	} finally {
		clearTimeout(timer);
	}
}
/** Is this local port a live DSH instance (index.html carries __DSH_BOOT__)? */
async function probePort(port) {
	try {
		const { status, body } = await request(`http://127.0.0.1:${port}/`);
		return {
			port,
			alive: status === 200 && body.includes("__DSH_BOOT__"),
			status
		};
	} catch {
		return {
			port,
			alive: false,
			status: 0
		};
	}
}
/** Concurrent probe of many ports (bounded chunking). */
async function probePorts(ports) {
	const CHUNK = 16;
	const out = [];
	for (let i = 0; i < ports.length; i += CHUNK) out.push(...await Promise.all(ports.slice(i, i + CHUNK).map((port) => probePort(port))));
	return out;
}
/** Send a small JSON response. */
function json(res, value, status = 200) {
	res.writeHead(status, {
		"content-type": JSON_TYPE,
		"cache-control": "no-store"
	});
	res.end(JSON.stringify(value));
}
/**
* Run a command and resolve its stdout text. Rejects on non-zero exit.
* @param file - the executable path.
* @param args - CLI arguments.
* @returns the trimmed stdout.
*/
function execStdout(file, args) {
	return new Promise((resolve, reject) => {
		execFile(file, args, { timeout: 5e3 }, (error, stdout) => {
			if (error !== null) {
				reject(error);
				return;
			}
			resolve(stdout);
		});
	});
}
/**
* Resolve the PIDs listening on a local TCP port. Windows uses `netstat`;
* POSIX uses `lsof` (present on macOS and most Linux installs).
* @param port - the listening port.
* @returns the listener PIDs (possibly empty).
*/
async function listeningPids(port) {
	if (process.platform === "win32") {
		const stdout = await execStdout("netstat", [
			"-ano",
			"-p",
			"tcp"
		]);
		const pids = /* @__PURE__ */ new Set();
		for (const line of stdout.split(/\r?\n/)) {
			const m = /^\s*TCP\s+([0-9.]+|\*|\[::\]):(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/.exec(line);
			if (m !== null && Number(m[2]) === port) pids.add(Number(m[3]));
		}
		return [...pids];
	}
	return (await execStdout("lsof", [
		"-ti",
		`tcp:${port}`,
		"-sTCP:LISTEN"
	])).split(/\s+/).map(Number).filter((pid) => Number.isInteger(pid) && pid > 0);
}
/**
* Terminate one PID. Windows uses `taskkill /F` (force); POSIX sends SIGTERM
* then SIGKILL after a grace period.
* @param pid - the process id to terminate.
*/
async function killPid(pid) {
	if (process.platform === "win32") {
		await execStdout("taskkill", [
			"/PID",
			String(pid),
			"/F",
			"/T"
		]);
		return;
	}
	try {
		process.kill(pid, "SIGTERM");
	} catch {}
	await new Promise((resolve) => setTimeout(resolve, 500));
	try {
		process.kill(pid, "SIGKILL");
	} catch {}
}
/**
* Terminate the DSH instance listening on one local port. The port serving
* this wall may also be terminated (the user may want to stop the instance
* they are viewing): the kill is deferred a beat so the HTTP response is
* written before the process dies, then the listener's PIDs are force-killed.
* @param port - the target port.
* @param selfPort - this instance's own listening port.
* @returns the stop result.
*/
async function stopPort(port, selfPort) {
	try {
		const pids = await listeningPids(port);
		if (pids.length === 0) return {
			port,
			ok: false,
			error: "no listener on this port"
		};
		const kill = () => Promise.all(pids.map((pid) => killPid(pid).catch(() => {})));
		if (port === selfPort) {
			setTimeout(() => {
				kill();
			}, 250);
			return {
				port,
				ok: true
			};
		}
		await kill();
		return {
			port,
			ok: true
		};
	} catch (error) {
		return {
			port,
			ok: false,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}
/**
* Resolve how to launch a new DSH instance. Primary path: the current
* process's own entry (`node <bin> web` under `process.argv[1]`), so the new
* instance inherits the exact CLI/profile already running. Fallback: the
* `dsh` command from PATH when the entry cannot be derived (unusual host
* launcher, missing file).
* @returns the launcher description.
*/
function resolveLauncher() {
	const first = process.argv[1];
	if (first !== void 0 && existsSync(first)) return {
		file: process.execPath,
		args: [
			first,
			"web",
			"--port"
		],
		shell: false
	};
	return {
		file: "dsh",
		args: ["web", "--port"],
		shell: process.platform === "win32"
	};
}
/**
* Probe whether a local TCP port is already listening (no HTTP needed).
* @param port - the port to check.
* @returns whether something listens on it.
*/
async function isPortBusy(port) {
	try {
		return (await listeningPids(port)).length > 0;
	} catch {
		return true;
	}
}
/**
* Pick the first free port in [lo, hi] that is neither the serving port nor
* already listening.
* @param lo - first port of the range.
* @param hi - last port of the range.
* @param selfPort - the port serving this wall (never chosen).
* @returns a free port, or undefined when the range is exhausted.
*/
async function pickFreePort(lo, hi, selfPort) {
	for (let port = lo; port <= hi; port++) {
		if (port === selfPort) continue;
		if (await isPortBusy(port)) continue;
		return port;
	}
}
/**
* Spawn a new `dsh web` instance on a port and wait until it serves the DSH
* shell (probe). Detached so it outlives this process. The child's stderr is
* captured and quoted into every failure, so a crash or a bad bin surfaces a
* concrete reason instead of a bare timeout.
* @param launcher - how to spawn the dsh CLI.
* @param port - the port for the new instance.
* @param timeoutMs - how long to wait for readiness.
* @returns ok plus the port, or ok:false with a reason.
*/
async function startInstance(launcher, port, timeoutMs = 2e4) {
	const child = spawn(launcher.file, [...launcher.args, String(port)], {
		detached: true,
		stdio: [
			"ignore",
			"ignore",
			"pipe"
		],
		windowsHide: true,
		shell: launcher.shell
	});
	child.unref();
	let stderr = "";
	const spawnFailure = { error: null };
	child.stderr?.on("data", (chunk) => {
		stderr += String(chunk);
		if (stderr.length > 2e3) stderr = stderr.slice(-2e3);
	});
	child.once("error", (error) => {
		spawnFailure.error = error;
	});
	const detail = () => {
		const tail = stderr.trim().split(/\r?\n/).slice(-3).join(" | ");
		return tail === "" ? "" : ` (${tail})`;
	};
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		if (spawnFailure.error !== null) return {
			ok: false,
			port,
			error: `new instance failed to start: ${spawnFailure.error.message}`
		};
		if (child.exitCode !== null) return {
			ok: false,
			port,
			error: `new instance exited early (code ${child.exitCode})${detail()}`
		};
		if ((await probePort(port)).alive) return {
			ok: true,
			port
		};
		if (Date.now() > deadline) return {
			ok: false,
			port,
			error: `instance did not become ready in time${detail()}`
		};
		await new Promise((resolve) => setTimeout(resolve, 400));
	}
}
/**
* The non-loopback IPv4 addresses of this machine (the LAN reachable URLs).
* @returns the address list (possibly empty).
*/
function lanAddresses() {
	const out = [];
	for (const ifaces of Object.values(networkInterfaces())) for (const iface of ifaces ?? []) if (iface.family === "IPv4" && !iface.internal) out.push(iface.address);
	return out;
}
/**
* Register the probe routes. Everything lives under `/multi/api` so the
* plugin is purely additive: exact `ports` (auto-discovery) and `status`
* (liveness of a specific port list).
* @param ctx - plugin context carrying the webServer service.
* @param config - validated {@link MultiWallConfig}.
*/
function apply(ctx, config = {}) {
	const scanFrom = config.scanFrom ?? 3070;
	const scanTo = config.scanTo ?? 3110;
	const fixedPorts = config.ports ?? [];
	let gateway = null;
	let gatewayTargetPort = -1;
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: "/multi/api/ports",
		handler: (req, res) => {
			if (req.method !== "GET" && req.method !== "HEAD") {
				res.writeHead(405);
				res.end();
				return;
			}
			const url = new URL(req.url ?? "/", "http://x");
			const qFromRaw = url.searchParams.get("from");
			const qToRaw = url.searchParams.get("to");
			const qFrom = qFromRaw !== null ? Number(qFromRaw) : NaN;
			const qTo = qToRaw !== null ? Number(qToRaw) : NaN;
			const lo = Number.isInteger(qFrom) ? qFrom : scanFrom;
			const hi = Number.isInteger(qTo) ? qTo : scanTo;
			const ports = fixedPorts.length > 0 ? [...fixedPorts] : [];
			if (fixedPorts.length === 0) for (let p = lo; p <= hi; p++) ports.push(p);
			probePorts(ports).then((results) => {
				json(res, { ports: results.filter((row) => row.alive) });
			}).catch(() => json(res, { ports: [] }, 500));
		}
	}), "multi-wall: /multi/api/ports");
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: "/multi/api/status",
		handler: (req, res) => {
			if (req.method !== "GET" && req.method !== "HEAD") {
				res.writeHead(405);
				res.end();
				return;
			}
			probePorts((new URL(req.url ?? "/", "http://x").searchParams.get("ports") ?? "").split(",").map(Number).filter((p) => Number.isInteger(p) && p > 0)).then((results) => {
				json(res, { ports: results });
			}).catch(() => json(res, { ports: [] }, 500));
		}
	}), "multi-wall: /multi/api/status");
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: "/multi/api/stop",
		handler: (req, res) => {
			if (req.method !== "GET" && req.method !== "POST") {
				res.writeHead(405);
				res.end();
				return;
			}
			const url = new URL(req.url ?? "/", "http://x");
			const ports = (url.searchParams.get("ports") ?? url.searchParams.get("port") ?? "").split(",").map(Number).filter((p) => Number.isInteger(p) && p > 0);
			const selfPort = ctx.webServer.port;
			Promise.all(ports.map((port) => stopPort(port, selfPort))).then((results) => {
				json(res, { ports: results });
			}).catch(() => json(res, { ports: [] }, 500));
		}
	}), "multi-wall: /multi/api/stop");
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: "/multi/api/create",
		handler: (req, res) => {
			if (req.method !== "GET" && req.method !== "POST") {
				res.writeHead(405);
				res.end();
				return;
			}
			const launcher = resolveLauncher();
			const selfPort = ctx.webServer.port;
			pickFreePort(scanFrom, scanTo, selfPort).then((port) => {
				if (port === void 0) {
					json(res, {
						ok: false,
						error: `no free port in ${scanFrom}–${scanTo}`
					}, 409);
					return;
				}
				return startInstance(launcher, port).then((result) => {
					json(res, result.ok ? {
						ok: true,
						port
					} : {
						ok: false,
						error: result.error
					}, result.ok ? 200 : 500);
					if (!result.ok) ctx.logger.warn(`multi-wall create failed: ${result.error}`);
				});
			}).catch((error) => {
				const message = error instanceof Error ? error.message : String(error);
				ctx.logger.warn(`multi-wall create error: ${message}`);
				json(res, {
					ok: false,
					error: message
				}, 500);
			});
		}
	}), "multi-wall: /multi/api/create");
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: "/multi/api/link",
		handler: (req, res) => {
			if (req.method !== "GET" && req.method !== "HEAD") {
				res.writeHead(405);
				res.end();
				return;
			}
			const port = ctx.webServer.port;
			const host = ctx.webServer.host;
			const publicUrl = (config.publicUrl ?? "").replace(/\/+$/, "");
			if (publicUrl !== "") {
				json(res, {
					port,
					host,
					lan: [`${publicUrl}/`],
					reachable: true
				});
				return;
			}
			const ensureGateway = () => {
				if (gateway !== null && gatewayTargetPort === port) return Promise.resolve(gateway);
				if (gateway !== null) {
					gateway.close();
					gateway = null;
				}
				const token = config.gatewayToken && config.gatewayToken !== "" ? config.gatewayToken : randomBytes(6).toString("hex");
				const gatewayPort = config.gatewayPort && config.gatewayPort !== 0 ? config.gatewayPort : port + 5e3;
				gatewayTargetPort = port;
				return startGateway({
					targetPort: port,
					port: gatewayPort,
					token,
					name: "DSH",
					log: (msg) => ctx.logger.info(`multi-wall gateway: ${msg}`)
				}).then((handle) => {
					gateway = handle;
					return handle;
				});
			};
			ensureGateway().then((handle) => {
				const urls = lanAddresses().map((ip) => `http://${ip}:${handle.port}/`);
				json(res, {
					port,
					host,
					lan: urls,
					gatewayPort: handle.port,
					token: handle.token,
					reachable: urls.length > 0,
					hint: urls.length === 0 ? "no LAN address detected; connect this machine to a network first" : void 0
				});
			}).catch((error) => {
				ctx.logger.warn(`multi-wall gateway start failed: ${error instanceof Error ? error.message : String(error)}`);
				json(res, {
					port,
					host,
					lan: [],
					reachable: false,
					hint: error instanceof Error ? error.message : String(error)
				}, 500);
			});
		}
	}), "multi-wall: /multi/api/link");
}
//#endregion
export { Config, apply, inject, name, stopPort };
