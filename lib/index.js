import { execFile, spawn } from "node:child_process";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import z from "@deepseek-ai/schemastery";
import { connect, createServer } from "node:net";

//#region src/gateway.ts
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
	const head = buffer.subarray(0, idx + 4).toString("latin1");
	const lines = head.split("\r\n");
	const requestLine = lines[0]?.match(/^(\S+)\s+(\S+)\s+(HTTP\/\d\.\d)$/);
	const headers = [];
	const map = {};
	for (const line of lines.slice(1)) {
		const ci = line.indexOf(":");
		if (ci === -1) continue;
		const name$1 = line.slice(0, ci).trim().toLowerCase();
		const value = line.slice(ci + 1).trim();
		map[name$1] = value;
		headers.push([name$1, value]);
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
function loginPage(name$1, next) {
	const nxt = (next ?? "").replace(/"/g, "&quot;");
	return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name$1} · 访问认证</title>
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
  <h1>${name$1} · 需要访问口令</h1>
  <label for="token">访问口令</label>
  <input id="token" name="token" type="password" autofocus autocomplete="current-password">
  <input type="hidden" name="next" value="${nxt}">
  <button type="submit">进入</button>
</form>
</body>
</html>`;
}
/** Send the login page as a 401 HTML response. */
function respondLogin(socket, name$1, next) {
	const body = Buffer.from(loginPage(name$1, next), "utf8");
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
* Send a 302 that mints a session cookie and drops the `token` query param.
* A `?token=` URL authenticates exactly one request, so on first arrival the
* gateway exchanges it for an HMAC-signed cookie and redirects to the same
* path without `token=` (keeps the secret out of the address bar / history).
*/
function respondSessionRedirect(socket, parsed, cookie) {
	let location = parsed.target;
	try {
		const url = new URL(parsed.target, "http://gateway.local");
		url.searchParams.delete("token");
		location = url.pathname + url.search;
	} catch {}
	socket.write(`HTTP/1.1 302 Found\r
location: ${location}\r\nset-cookie: ${cookie}\r\ncontent-length: 0\r
connection: close\r
cache-control: no-store\r
\r
`);
	socket.end();
}
/**
* `crypto.randomUUID` exists only in a *secure context* (HTTPS or localhost).
* A phone reaching the instance via `http://<LAN-IP>:<gateway-port>` is an
* insecure origin, so the official DSH client throws
* `crypto.randomUUID is not a function` on its first RPC and renders blank.
* This polyfill supplies the same RFC-4122 v4 form using
* `crypto.getRandomValues`, which insecure origins still expose.
*/
const POLYFILL_SCRIPT = "<script>(function(){if(typeof crypto!==\"undefined\"&&typeof crypto.randomUUID===\"undefined\"&&typeof crypto.getRandomValues===\"function\"){crypto.randomUUID=function(){var b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;var h=Array.prototype.map.call(b,function(x){return x.toString(16).padStart(2,\"0\")}).join(\"\");return h.slice(0,8)+\"-\"+h.slice(8,12)+\"-\"+h.slice(12,16)+\"-\"+h.slice(16,20)+\"-\"+h.slice(20);};}})();</script>";
/**
* Rewrite a buffered HTML response body to inject the `randomUUID` polyfill
* into the top of `<head>` (before the DSH bootstrap script runs). Returns the
* new body, or `null` when the polyfill is not needed (already present, or the
* response carries no `<head>` to inject into).
*/
function injectPolyfill(body) {
	const html = body.toString("utf8");
	if (html.includes("randomUUID")) return null;
	const headMatch = /<head[^>]*>/i.exec(html);
	if (headMatch === null) return null;
	const insertAt = headMatch.index + headMatch[0].length;
	return Buffer.from(html.slice(0, insertAt) + POLYFILL_SCRIPT + html.slice(insertAt), "utf8");
}
/**
* Rebuild the request head for the loopback target. Host and Origin point at
* `127.0.0.1:<target-port>` so the DSH `/api` browser-trust fence sees a local
* request. Non-upgrade requests get `connection: close` (fresh connection per
* request keeps keep-alive from smuggling unrewritten Host headers); upgrades
* (WebSocket) keep `connection: Upgrade`. When `pathOverride` is set (a
* `/gw/<port>` route), the request line's path becomes the de-prefixed path.
*/
function rewriteHead(parsed, targetPort, pathOverride) {
	const upgrade = parsed.map.upgrade !== void 0;
	const requestTarget = pathOverride !== void 0 ? pathOverride : parsed.target;
	const lines = [`${parsed.method} ${requestTarget} ${parsed.version}`];
	for (const [name$1, value] of parsed.headers) if (name$1 === "host") lines.push(`host: 127.0.0.1:${targetPort}`);
	else if (name$1 === "origin") lines.push(`origin: http://127.0.0.1:${targetPort}`);
	else if (name$1 === "connection" || name$1 === "proxy-connection") {} else lines.push(`${name$1}: ${value}`);
	lines.push(upgrade ? "connection: Upgrade" : "connection: close");
	return lines.join("\r\n") + "\r\n\r\n";
}
/**
* Start an in-process authenticated gateway for one loopback DSH instance.
* @param options - target, listen port, token, label, and lifetime.
* @returns a handle with the assigned port and token, and a close().
*/
function startGateway(options) {
	const { targetPort, port: requestedPort, token, name: name$1, maxAgeHours = 12, routedPorts, log = () => {} } = options;
	const allowedRouted = new Set(routedPorts ?? []);
	const hmac = (data) => createHmac("sha256", token).update(data).digest("hex");
	const signSession = (exp) => {
		const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
		return `${payload}.${hmac(payload)}`;
	};
	const verifySession = (value) => {
		const dot = value.lastIndexOf(".");
		if (dot <= 0) return false;
		const payload = value.slice(0, dot);
		const sig = value.slice(dot + 1);
		if (!safeEqualHex(sig, hmac(payload))) return false;
		try {
			const parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
			return typeof parsed.exp === "number" && parsed.exp > Date.now();
		} catch {
			return false;
		}
	};
	const authKind = (parsed) => {
		const cookie = parsed.map.cookie ?? "";
		const session = /(?:^|;\s*)dsh_gw_session=([^;]+)/.exec(cookie);
		if (session !== null && verifySession(session[1] ?? "")) return "cookie";
		const bearer = parsed.map.authorization ?? "";
		if (bearer.startsWith("Bearer ") && bearer.slice(7) === token) return "bearer";
		try {
			if (new URL(parsed.target, "http://gateway.local").searchParams.get("token") === token) return "query";
		} catch {}
		return "none";
	};
	const attempts = new Map();
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
			respondLogin(socket, name$1, next);
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
			const submitted = new URLSearchParams(collected.toString("utf8")).get("token") ?? "";
			if (submitted === token) {
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
				respondLogin(socket, name$1, next);
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
	/**
	* Decode an HTTP/1.1 `transfer-encoding: chunked` body back to its raw
	* bytes. Returns `null` on malformed framing (caller then relays verbatim).
	*/
	const decodeChunked = (raw) => {
		const out = [];
		let i = 0;
		const text = raw.toString("latin1");
		while (true) {
			const crlf = text.indexOf("\r\n", i);
			if (crlf === -1) return null;
			const sizeHex = text.slice(i, crlf).trim();
			const size = parseInt(sizeHex, 16);
			if (!Number.isFinite(size) || size < 0) return null;
			i = crlf + 2;
			if (size === 0) return Buffer.concat(out);
			if (i + size > raw.length) return null;
			out.push(raw.subarray(i, i + size));
			i += size + 2;
		}
	};
	/**
	* Relay the DSH target's response to the phone client. HTML document
	* responses (the DSH shell) are buffered so the `randomUUID` polyfill can be
	* injected before the bootstrap script runs; every other response
	* (assets, API JSON, SSE streams, WebSocket upgrades) is piped byte-for-byte
	* so streaming and framing stay untouched.
	*/
	const relayTarget = (socket, target) => {
		let head = Buffer.alloc(0);
		let bodyParts = null;
		let relayed = false;
		const pipeThrough = () => {
			if (relayed) return;
			relayed = true;
			if (head.length > 0) socket.write(head);
			if (bodyParts !== null && bodyParts.length > 0) {
				socket.write(Buffer.concat(bodyParts));
				bodyParts = null;
			}
			target.pipe(socket);
		};
		const finishInjection = (fullHead, fullBody) => {
			const rewritten = injectPolyfill(fullBody);
			if (rewritten === null) {
				socket.write(fullHead);
				socket.write(fullBody);
				socket.end();
				return;
			}
			const lines = fullHead.toString("latin1").split("\r\n");
			const filtered = [];
			for (const line of lines) {
				const lower = line.toLowerCase();
				if (lower.startsWith("transfer-encoding:")) continue;
				if (lower.startsWith("content-length:")) continue;
				if (lower.startsWith("connection:")) continue;
				filtered.push(line);
			}
			while (filtered.length > 0 && filtered[filtered.length - 1] === "") filtered.pop();
			filtered.push(`content-length: ${rewritten.length}`, "connection: close", "", "");
			socket.write(Buffer.from(filtered.join("\r\n"), "latin1"));
			socket.write(rewritten);
			socket.end();
		};
		target.on("data", (chunk) => {
			if (relayed) return;
			const idx = head.indexOf("\r\n\r\n");
			if (idx === -1) {
				head = head.length === 0 ? chunk : Buffer.concat([head, chunk]);
				const newIdx = head.indexOf("\r\n\r\n");
				if (newIdx === -1) {
					if (head.length > 65536) pipeThrough();
					return;
				}
				const headBuf = head.subarray(0, newIdx + 4);
				const bodyStart = head.subarray(newIdx + 4);
				const headText = headBuf.toString("latin1");
				const status = /^HTTP\/\d\.\d (\d{3})/.exec(headText)?.[1] ?? "";
				const contentType = /^content-type:\s*([^\r\n]+)/im.exec(headText)?.[1] ?? "";
				const ce = /^content-encoding:\s*([^\r\n]+)/im.exec(headText)?.[1] ?? "";
				const isHtml = status === "200" && /text\/html/i.test(contentType);
				const compressed = ce !== "" && !/identity/i.test(ce);
				if (!isHtml || compressed) {
					pipeThrough();
					return;
				}
				bodyParts = bodyStart.length > 0 ? [bodyStart] : [];
				return;
			}
			if (bodyParts !== null) bodyParts.push(chunk);
		});
		target.once("end", () => {
			if (relayed || bodyParts === null) {
				if (!relayed) socket.end();
				return;
			}
			const headBuf = head.subarray(0, head.indexOf("\r\n\r\n") + 4);
			const headText = headBuf.toString("latin1");
			const rawBody = Buffer.concat(bodyParts);
			const te = /^transfer-encoding:\s*([^\r\n]+)/im.exec(headText)?.[1] ?? "";
			const body = /chunked/i.test(te) ? decodeChunked(rawBody) ?? rawBody : rawBody;
			finishInjection(headBuf, body);
		});
		target.once("error", () => socket.destroy());
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
			let routePort = null;
			let routePath;
			const routeMatch = /^\/gw\/(\d+)(\/.*)?$/.exec(path);
			if (routeMatch !== null) {
				const candidate = Number(routeMatch[1]);
				if (!Number.isInteger(candidate) || candidate <= 0 || !allowedRouted.has(candidate)) {
					respondPlain(socket, "403", "port not routable");
					return;
				}
				routePort = candidate;
				routePath = routeMatch[2] && routeMatch[2] !== "" ? routeMatch[2] : "/";
			}
			const effectivePort = routePort ?? targetPort;
			const kind = authKind(parsed);
			if (kind === "none") {
				respondLogin(socket, name$1, path === "/" ? "/" : path);
				return;
			}
			if (kind === "query") {
				const cookie = `dsh_gw_session=${signSession(Date.now() + maxAgeHours * 36e5)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeHours * 3600}`;
				respondSessionRedirect(socket, parsed, cookie);
				return;
			}
			const target = connect(effectivePort, "127.0.0.1");
			const rest = buffer.subarray(parsed.headBytes);
			let connected = false;
			target.on("connect", () => {
				connected = true;
				target.write(rewriteHead(parsed, effectivePort, routePath));
				if (rest.length > 0) target.write(rest);
				proxying = true;
				socket.pipe(target);
				relayTarget(socket, target);
			});
			target.on("error", (error) => {
				if (!connected) respondPlain(socket, "502", `cannot reach target 127.0.0.1:${effectivePort}: ${error.message}`);
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
		const onError = (error) => {
			if ((error.code === "EACCES" || error.code === "EADDRINUSE") && requestedPort !== 0) {
				log(`gateway port ${requestedPort} unavailable (${error.code}), using an OS-assigned port`);
				server.listen(0, "0.0.0.0");
				return;
			}
			server.removeListener("error", onError);
			reject(error);
		};
		server.on("error", onError);
		server.listen(requestedPort, "0.0.0.0", () => {
			server.removeListener("error", onError);
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
//#region src/index.ts
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
		const stdout$1 = await execStdout("netstat", [
			"-ano",
			"-p",
			"tcp"
		]);
		const pids = new Set();
		for (const line of stdout$1.split(/\r?\n/)) {
			const m = /^\s*TCP\s+([0-9.]+|\*|\[::\]):(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/.exec(line);
			if (m !== null && Number(m[2]) === port) pids.add(Number(m[3]));
		}
		return [...pids];
	}
	const stdout = await execStdout("lsof", [
		"-ti",
		`tcp:${port}`,
		"-sTCP:LISTEN"
	]);
	return stdout.split(/\s+/).map(Number).filter((pid) => Number.isInteger(pid) && pid > 0);
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
* Collect every distinct local TCP port that is listening, in ONE command
* (not one `netstat`/`lsof` per candidate, which the old free-port scan ran
* sequentially and could take many seconds on slow Windows boxes). Windows
* parses `netstat`; POSIX parses `lsof` `(LISTEN)` lines.
* @returns the set of busy ports.
*/
async function listeningPorts() {
	const set = new Set();
	if (process.platform === "win32") {
		const stdout$1 = await execStdout("netstat", [
			"-ano",
			"-p",
			"tcp"
		]);
		for (const line of stdout$1.split(/\r?\n/)) {
			const m = /^\s*TCP\s+([0-9.]+|\*|\[::\]):(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/.exec(line);
			if (m !== null) set.add(Number(m[2]));
		}
		return set;
	}
	const stdout = await execStdout("lsof", [
		"-nP",
		"-iTCP",
		"-sTCP:LISTEN"
	]);
	for (const line of stdout.split(/\r?\n/)) {
		const m = /:(\d+)\s+\(LISTEN\)\s*$/.exec(line.trim());
		if (m !== null) set.add(Number(m[1]));
	}
	return set;
}
/**
* Pick the first free port in [lo, hi] that is neither the serving port nor
* already listening. The busy set is resolved once (a single command), then
* scanned in memory.
* @param lo - first port of the range.
* @param hi - last port of the range.
* @param selfPort - the port serving this wall (never chosen).
* @returns a free port, or undefined when the range is exhausted.
*/
async function pickFreePort(lo, hi, selfPort) {
	const busy = await listeningPorts();
	for (let port = lo; port <= hi; port++) {
		if (port === selfPort) continue;
		if (busy.has(port)) continue;
		return port;
	}
	return void 0;
}
/**
* Spawn a new `dsh web` instance on a port and decide quickly whether it is
* viable. Detached so it outlives this process. This is intentionally NOT a
* full readiness gate: the wall polls liveness itself, so the create response
* returns fast and a still-booting instance simply shows a pane that lights up
* when the server finishes. A short bounded wait still catches immediate
* spawn failures (bad bin, ENOENT) and very fast boots.
*
* On a genuine launch failure the child is killed so no orphan lingers; on a
* slow-but-viable start the deadline returns ok:true and the child keeps
* booting in the background (the pane already mounted, liveness confirms when
* alive). The child's stderr is captured and quoted into every failure so a
* crash or a bad bin surfaces a concrete reason instead of a bare timeout.
* @param launcher - how to spawn the dsh CLI.
* @param port - the port for the new instance.
* @param timeoutMs - how long to wait before handing back ok:true.
* @param pollMs - readiness probe interval while waiting.
* @returns ok plus the port, or ok:false with a reason.
*/
async function startInstance(launcher, port, timeoutMs = 3e3, pollMs = 300) {
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
		if (spawnFailure.error !== null) {
			try {
				child.kill();
			} catch {}
			return {
				ok: false,
				port,
				error: `new instance failed to start: ${spawnFailure.error.message}`
			};
		}
		if (child.exitCode !== null) return {
			ok: false,
			port,
			error: `new instance exited early (code ${child.exitCode})${detail()}`
		};
		const row = await probePort(port);
		if (row.alive) return {
			ok: true,
			port
		};
		if (Date.now() > deadline) return {
			ok: true,
			port
		};
		await new Promise((resolve) => setTimeout(resolve, pollMs));
	}
}
/**
* Interface-name patterns that mark a *virtual* NIC (VM bridge, WSL,
* Docker, Hyper-V, VPN adapters, Loopback Pseudo-Instance, etc.). These
* interfaces are never reachable from a phone on the same LAN, so they are
* dropped from the link list entirely.
*/
const VIRTUAL_IFACE_PATTERNS = [
	/vEthernet/i,
	/vmware/i,
	/virtualbox/i,
	/^vbox/i,
	/wsl/i,
	/docker/i,
	/hyper-v/i,
	/tap-windows/i,
	/^tap/i,
	/^tun/i,
	/ppp/i,
	/loopback/i,
	/apipa/i,
	/^utun/i,
	/^awdl/i,
	/^llw/i,
	/^bridge/i,
	/bluetooth/i
];
/**
* Interface-name patterns that mark a *physical* NIC (Wi-Fi / Ethernet).
* Matches kept addresses are ordered before any unknown-but-surviving
* address so the phone-first address is the machine's real NIC.
*/
const PHYSICAL_IFACE_PATTERNS = [
	/^(wi-?fi|wlan|wireless)/i,
	/^(eth(ernet)?|以太网|以太)/i,
	/^(en|wan)[0-9]/i,
	/^本地连接/i,
	/^e[0-9]+$/i,
	/^w[0-9]+$/i
];
/**
* The non-loopback IPv4 addresses of this machine (the LAN reachable URLs).
* Virtual NICs (VM/WSL/Docker/VPN/loopback pseudo) are filtered out; the
* remaining addresses are ordered with physical NICs (Wi-Fi/Ethernet) first
* so the phone shows the actually-reachable LAN address at the top.
* @returns the address list (possibly empty).
*/
function lanAddresses() {
	const candidates = [];
	for (const [name$1, ifaces] of Object.entries(networkInterfaces())) {
		const virtual = VIRTUAL_IFACE_PATTERNS.some((re) => re.test(name$1));
		const physical = !virtual && PHYSICAL_IFACE_PATTERNS.some((re) => re.test(name$1));
		for (const iface of ifaces ?? []) {
			if (iface.family !== "IPv4" || iface.internal) continue;
			if (virtual) continue;
			candidates.push({
				address: iface.address,
				physical,
				virtual: false
			});
		}
	}
	candidates.sort((a, b) => Number(b.physical) - Number(a.physical));
	return candidates.map((c) => c.address);
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
			const url = new URL(req.url ?? "/", "http://x");
			const ports = (url.searchParams.get("ports") ?? "").split(",").map(Number).filter((p) => Number.isInteger(p) && p > 0);
			probePorts(ports).then((results) => {
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
			const raw = url.searchParams.get("ports") ?? url.searchParams.get("port") ?? "";
			const ports = raw.split(",").map(Number).filter((p) => Number.isInteger(p) && p > 0);
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
				const routed = [];
				for (let p = scanFrom; p <= scanTo; p++) routed.push(p);
				for (const p of fixedPorts) if (!routed.includes(p)) routed.push(p);
				return startGateway({
					targetPort: port,
					port: gatewayPort,
					token,
					name: "DSH",
					routedPorts: routed,
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