/**
 * Multi-window wall plugin, node half: registers the `/multi/api/*` routes
 * on the webserver. The browser half fetches these same-origin to discover
 * which local ports are live DSH instances, to poll liveness, and to
 * terminate a chosen instance (`/multi/api/stop`). The wall itself is pure
 * UI — this half answers a few small JSON requests.
 * @module @deepseek-ai/dsh-client-ui-multi-wall
 */
import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import z from '@deepseek-ai/schemastery';
import { startGateway } from './gateway';
/** Stable Cordis plugin name. */
export const name = 'client-ui-multi-wall';
/** Services required before the probe routes can be registered. */
export const inject = ['webServer'];
/** Schema-validated config (the Loader resolves defaults for absent keys). */
export const Config = z.object({
    scanFrom: z.natural().default(3070),
    scanTo: z.natural().default(3110),
    ports: z.array(z.natural()).default([]),
    publicUrl: z.string().default(''),
    gatewayPort: z.number().default(0),
    gatewayToken: z.string().default(''),
});
/** MIME for JSON probe answers. */
const JSON_TYPE = 'application/json; charset=utf-8';
/** GET one local URL with a short timeout; resolve {status, body} or reject. */
async function request(url, timeoutMs = 600) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal });
        return { status: res.status, body: await res.text() };
    }
    finally {
        clearTimeout(timer);
    }
}
/** Is this local port a live DSH instance (index.html carries __DSH_BOOT__)? */
async function probePort(port) {
    try {
        const { status, body } = await request(`http://127.0.0.1:${port}/`);
        return { port, alive: status === 200 && body.includes('__DSH_BOOT__'), status };
    }
    catch {
        return { port, alive: false, status: 0 };
    }
}
/** Concurrent probe of many ports (bounded chunking). */
async function probePorts(ports) {
    const CHUNK = 16;
    const out = [];
    for (let i = 0; i < ports.length; i += CHUNK) {
        out.push(...(await Promise.all(ports.slice(i, i + CHUNK).map(port => probePort(port)))));
    }
    return out;
}
/** Send a small JSON response. */
function json(res, value, status = 200) {
    res.writeHead(status, { 'content-type': JSON_TYPE, 'cache-control': 'no-store' });
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
        execFile(file, args, { timeout: 5000 }, (error, stdout) => {
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
    if (process.platform === 'win32') {
        const stdout = await execStdout('netstat', ['-ano', '-p', 'tcp']);
        const pids = new Set();
        for (const line of stdout.split(/\r?\n/)) {
            // TCP    127.0.0.1:3080   0.0.0.0:0   LISTENING   12345
            const m = /^\s*TCP\s+([0-9.]+|\*|\[::\]):(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/.exec(line);
            if (m !== null && Number(m[2]) === port)
                pids.add(Number(m[3]));
        }
        return [...pids];
    }
    const stdout = await execStdout('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN']);
    return stdout.split(/\s+/).map(Number).filter(pid => Number.isInteger(pid) && pid > 0);
}
/**
 * Terminate one PID. Windows uses `taskkill /F` (force); POSIX sends SIGTERM
 * then SIGKILL after a grace period.
 * @param pid - the process id to terminate.
 */
async function killPid(pid) {
    if (process.platform === 'win32') {
        await execStdout('taskkill', ['/PID', String(pid), '/F', '/T']);
        return;
    }
    try {
        process.kill(pid, 'SIGTERM');
    }
    catch {
        // Race: process already gone — treat as terminated.
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    try {
        process.kill(pid, 'SIGKILL');
    }
    catch {
        // Already gone.
    }
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
export async function stopPort(port, selfPort) {
    try {
        const pids = await listeningPids(port);
        if (pids.length === 0) {
            return { port, ok: false, error: 'no listener on this port' };
        }
        const kill = () => Promise.all(pids.map(pid => killPid(pid).catch(() => { })));
        if (port === selfPort) {
            // Let the response flush before taking ourselves down.
            setTimeout(() => { void kill(); }, 250);
            return { port, ok: true };
        }
        await kill();
        return { port, ok: true };
    }
    catch (error) {
        return { port, ok: false, error: error instanceof Error ? error.message : String(error) };
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
    if (first !== undefined && existsSync(first)) {
        return { file: process.execPath, args: [first, 'web', '--port'], shell: false };
    }
    return { file: 'dsh', args: ['web', '--port'], shell: process.platform === 'win32' };
}
/**
 * Probe whether a local TCP port is already listening (no HTTP needed).
 * @param port - the port to check.
 * @returns whether something listens on it.
 */
async function isPortBusy(port) {
    try {
        const pids = await listeningPids(port);
        return pids.length > 0;
    }
    catch {
        return true; // probe failure is treated as busy (fail loud)
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
        if (port === selfPort)
            continue;
        if (await isPortBusy(port))
            continue;
        return port;
    }
    return undefined;
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
async function startInstance(launcher, port, timeoutMs = 20000) {
    const child = spawn(launcher.file, [...launcher.args, String(port)], {
        detached: true,
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsHide: true,
        shell: launcher.shell,
    });
    child.unref();
    let stderr = '';
    // Held by property so flow analysis cannot conclude the closure assignment
    // never runs (a local assigned only inside a callback narrows to never at
    // the check).
    const spawnFailure = { error: null };
    child.stderr?.on('data', chunk => {
        stderr += String(chunk);
        if (stderr.length > 2000)
            stderr = stderr.slice(-2000);
    });
    child.once('error', error => { spawnFailure.error = error; });
    const detail = () => {
        const tail = stderr.trim().split(/\r?\n/).slice(-3).join(' | ');
        return tail === '' ? '' : ` (${tail})`;
    };
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        if (spawnFailure.error !== null) {
            return { ok: false, port, error: `new instance failed to start: ${spawnFailure.error.message}` };
        }
        if (child.exitCode !== null) {
            return { ok: false, port, error: `new instance exited early (code ${child.exitCode})${detail()}` };
        }
        const row = await probePort(port);
        if (row.alive)
            return { ok: true, port };
        if (Date.now() > deadline) {
            return { ok: false, port, error: `instance did not become ready in time${detail()}` };
        }
        await new Promise(resolve => setTimeout(resolve, 400));
    }
}
/**
 * Interface-name patterns that mark a *virtual* NIC (VM bridge, WSL,
 * Docker, Hyper-V, VPN adapters, Loopback Pseudo-Instance, etc.). These
 * interfaces are never reachable from a phone on the same LAN, so they are
 * dropped from the link list entirely.
 */
const VIRTUAL_IFACE_PATTERNS = [
    /vEthernet/i, // Hyper-V virtual switch
    /vmware/i, // VMware VMnet adapters
    /virtualbox/i, // VirtualBox host-only
    /^vbox/i,
    /wsl/i, // Windows Subsystem for Linux
    /docker/i, // Docker / DockerNAT
    /hyper-v/i,
    /tap-windows/i, // OpenVPN TAP
    /^tap/i,
    /^tun/i, // TUN VPN tunnels
    /ppp/i,
    /loopback/i, // Loopback Pseudo-Interface 1
    /apipa/i, // automatic private IP (169.254.*.*)
    /^utun/i, // macOS TUN
    /^awdl/i, // macOS Apple Wireless Direct Link
    /^llw/i, // macOS low-latency WLAN
    /^bridge/i,
    /bluetooth/i,
];
/**
 * Interface-name patterns that mark a *physical* NIC (Wi-Fi / Ethernet).
 * Matches kept addresses are ordered before any unknown-but-surviving
 * address so the phone-first address is the machine's real NIC.
 */
const PHYSICAL_IFACE_PATTERNS = [
    /^(wi-?fi|wlan|wireless)/i,
    /^(eth(ernet)?|以太网|以太)/i,
    /^(en|wan)[0-9]/i, // macOS en0 / en1
    /^本地连接/i,
    /^e[0-9]+$/i, // bare ethernet (linux)
    /^w[0-9]+$/i, // bare wlan (linux)
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
    for (const [name, ifaces] of Object.entries(networkInterfaces())) {
        const virtual = VIRTUAL_IFACE_PATTERNS.some(re => re.test(name));
        const physical = !virtual && PHYSICAL_IFACE_PATTERNS.some(re => re.test(name));
        for (const iface of ifaces ?? []) {
            if (iface.family !== 'IPv4' || iface.internal)
                continue;
            if (virtual)
                continue; // drop virtual NICs entirely
            candidates.push({ address: iface.address, physical, virtual: false });
        }
    }
    candidates.sort((a, b) => Number(b.physical) - Number(a.physical));
    return candidates.map(c => c.address);
}
/**
 * Register the probe routes. Everything lives under `/multi/api` so the
 * plugin is purely additive: exact `ports` (auto-discovery) and `status`
 * (liveness of a specific port list).
 * @param ctx - plugin context carrying the webServer service.
 * @param config - validated {@link MultiWallConfig}.
 */
export function apply(ctx, config = {}) {
    const scanFrom = config.scanFrom ?? 3070;
    const scanTo = config.scanTo ?? 3110;
    const fixedPorts = config.ports ?? [];
    // Inline gateway state: lazily started on first `/multi/api/link` call and
    // reused until the target port changes (or the instance restarts).
    let gateway = null;
    let gatewayTargetPort = -1;
    ctx.effect(() => ctx.webServer.register({
        kind: 'exact',
        path: '/multi/api/ports',
        handler: (req, res) => {
            if (req.method !== 'GET' && req.method !== 'HEAD') {
                res.writeHead(405);
                res.end();
                return;
            }
            const url = new URL(req.url ?? '/', 'http://x');
            const qFromRaw = url.searchParams.get('from');
            const qToRaw = url.searchParams.get('to');
            const qFrom = qFromRaw !== null ? Number(qFromRaw) : NaN;
            const qTo = qToRaw !== null ? Number(qToRaw) : NaN;
            const lo = Number.isInteger(qFrom) ? qFrom : scanFrom;
            const hi = Number.isInteger(qTo) ? qTo : scanTo;
            const ports = fixedPorts.length > 0 ? [...fixedPorts] : [];
            if (fixedPorts.length === 0) {
                for (let p = lo; p <= hi; p++)
                    ports.push(p);
            }
            // The serving instance is a discoverable target too: the user may want
            // to watch (or stop) the very instance hosting the wall. Recursion is
            // prevented client-side by the ?multi-wall=embed pane flag, not by
            // hiding the self port.
            probePorts(ports).then(results => {
                json(res, { ports: results.filter(row => row.alive) });
            }).catch(() => json(res, { ports: [] }, 500));
        },
    }), 'multi-wall: /multi/api/ports');
    ctx.effect(() => ctx.webServer.register({
        kind: 'exact',
        path: '/multi/api/status',
        handler: (req, res) => {
            if (req.method !== 'GET' && req.method !== 'HEAD') {
                res.writeHead(405);
                res.end();
                return;
            }
            const url = new URL(req.url ?? '/', 'http://x');
            const ports = (url.searchParams.get('ports') ?? '')
                .split(',')
                .map(Number)
                .filter(p => Number.isInteger(p) && p > 0);
            probePorts(ports).then(results => {
                json(res, { ports: results });
            }).catch(() => json(res, { ports: [] }, 500));
        },
    }), 'multi-wall: /multi/api/status');
    // Terminate the DSH instance on a specific port (closes that session).
    // GET /multi/api/stop?port=3080  or  ?ports=3080,3081
    ctx.effect(() => ctx.webServer.register({
        kind: 'exact',
        path: '/multi/api/stop',
        handler: (req, res) => {
            if (req.method !== 'GET' && req.method !== 'POST') {
                res.writeHead(405);
                res.end();
                return;
            }
            const url = new URL(req.url ?? '/', 'http://x');
            const raw = url.searchParams.get('ports') ?? url.searchParams.get('port') ?? '';
            const ports = raw.split(',').map(Number).filter(p => Number.isInteger(p) && p > 0);
            const selfPort = ctx.webServer.port;
            Promise.all(ports.map(port => stopPort(port, selfPort))).then(results => {
                json(res, { ports: results });
            }).catch(() => json(res, { ports: [] }, 500));
        },
    }), 'multi-wall: /multi/api/stop');
    // Start a NEW DSH instance and return its port, so the wall can grow a
    // fresh window without leaving the page. Spawns `dsh web` on the first
    // free port of the scan range (never the serving port) and waits until it
    // answers the DSH shell probe.
    // POST /multi/api/create   (GET also accepted for convenience)
    ctx.effect(() => ctx.webServer.register({
        kind: 'exact',
        path: '/multi/api/create',
        handler: (req, res) => {
            if (req.method !== 'GET' && req.method !== 'POST') {
                res.writeHead(405);
                res.end();
                return;
            }
            const launcher = resolveLauncher();
            const selfPort = ctx.webServer.port;
            void pickFreePort(scanFrom, scanTo, selfPort).then(port => {
                if (port === undefined) {
                    json(res, { ok: false, error: `no free port in ${scanFrom}–${scanTo}` }, 409);
                    return;
                }
                return startInstance(launcher, port).then(result => {
                    json(res, result.ok ? { ok: true, port } : { ok: false, error: result.error }, result.ok ? 200 : 500);
                    if (!result.ok)
                        ctx.logger.warn(`multi-wall create failed: ${result.error}`);
                });
            }).catch((error) => {
                const message = error instanceof Error ? error.message : String(error);
                ctx.logger.warn(`multi-wall create error: ${message}`);
                json(res, { ok: false, error: message }, 500);
            });
        },
    }), 'multi-wall: /multi/api/create');
    // The phone-reachable URL for this instance. The official CLI forbids
    // `--host 0.0.0.0` (it would expose remote code execution), so a loopback
    // instance is reached from a phone through an auth-gated gateway. When
    // `publicUrl` is configured, that URL is reported verbatim. Otherwise this
    // route lazily starts the inline gateway (target 127.0.0.1:<selfPort>) and
    // answers with the LAN URLs plus the generated/fixed login token.
    // GET /multi/api/link
    ctx.effect(() => ctx.webServer.register({
        kind: 'exact',
        path: '/multi/api/link',
        handler: (req, res) => {
            if (req.method !== 'GET' && req.method !== 'HEAD') {
                res.writeHead(405);
                res.end();
                return;
            }
            const port = ctx.webServer.port;
            const host = ctx.webServer.host;
            const publicUrl = (config.publicUrl ?? '').replace(/\/+$/, '');
            if (publicUrl !== '') {
                json(res, { port, host, lan: [`${publicUrl}/`], reachable: true });
                return;
            }
            // Ensure the inline gateway targets THIS instance's port.
            const ensureGateway = () => {
                if (gateway !== null && gatewayTargetPort === port) {
                    return Promise.resolve(gateway);
                }
                // Target changed (or first start): close the stale gateway first.
                if (gateway !== null) {
                    gateway.close();
                    gateway = null;
                }
                const token = config.gatewayToken && config.gatewayToken !== '' ? config.gatewayToken : randomBytes(6).toString('hex');
                const gatewayPort = config.gatewayPort && config.gatewayPort !== 0 ? config.gatewayPort : port + 5000;
                gatewayTargetPort = port;
                // Allow the gateway's `/gw/<port>` route only for ports a DSH instance
                // can actually live on: the scan range plus any fixed ports.
                const routed = [];
                for (let p = scanFrom; p <= scanTo; p++)
                    routed.push(p);
                for (const p of fixedPorts)
                    if (!routed.includes(p))
                        routed.push(p);
                return startGateway({
                    targetPort: port,
                    port: gatewayPort,
                    token,
                    name: 'DSH',
                    routedPorts: routed,
                    log: (msg) => ctx.logger.info(`multi-wall gateway: ${msg}`),
                }).then(handle => {
                    gateway = handle;
                    return handle;
                });
            };
            ensureGateway().then(handle => {
                const urls = lanAddresses().map(ip => `http://${ip}:${handle.port}/`);
                json(res, {
                    port,
                    host,
                    lan: urls,
                    gatewayPort: handle.port,
                    token: handle.token,
                    reachable: urls.length > 0,
                    hint: urls.length === 0
                        ? 'no LAN address detected; connect this machine to a network first'
                        : undefined,
                });
            }).catch((error) => {
                ctx.logger.warn(`multi-wall gateway start failed: ${error instanceof Error ? error.message : String(error)}`);
                json(res, {
                    port,
                    host,
                    lan: [],
                    reachable: false,
                    hint: error instanceof Error ? error.message : String(error),
                }, 500);
            });
        },
    }), 'multi-wall: /multi/api/link');
}
//# sourceMappingURL=index.js.map