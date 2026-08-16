/**
 * Multi-window wall plugin, node half: registers the `/multi/api/*` routes
 * on the webserver. The browser half fetches these same-origin to discover
 * which local ports are live DSH instances, to poll liveness, and to
 * terminate a chosen instance (`/multi/api/stop`). The wall itself is pure
 * UI — this half answers a few small JSON requests.
 * @module @deepseek-ai/dsh-client-ui-multi-wall
 */

import { execFile, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { startGateway, type GatewayHandle } from './gateway'

/** Stable Cordis plugin name. */
export const name = 'client-ui-multi-wall'

/** Services required before the probe routes can be registered. */
export const inject = ['webServer']

/** Plugin config: the wall's auto-discovery scan range. */
export interface MultiWallConfig {
  /** First port of the auto-discovery range. */
  scanFrom?: number
  /** Last port of the auto-discovery range. */
  scanTo?: number
  /** Optional fixed port list; when set, discovery ignores the scan range. */
  ports?: number[]
  /**
   * External base URL reported by `/multi/api/link` (e.g. the authenticated
   * gateway in front of this loopback instance). When set, the link route
   * answers `{ lan: [publicUrl + '/'], reachable: true }`.
   */
  publicUrl?: string
  /**
   * Gateway listen port for the inline phone-access gateway. `0` (default)
   * means `targetPort + 5000`.
   */
  gatewayPort?: number
  /**
   * Optional fixed login token for the inline gateway. Empty (default) means
   * a random token is generated per gateway start (returned by /multi/api/link).
   */
  gatewayToken?: string
}

/** Schema-validated config (the Loader resolves defaults for absent keys). */
export const Config = z.object({
  scanFrom: z.natural().default(3070),
  scanTo: z.natural().default(3110),
  ports: z.array(z.natural()).default([]),
  publicUrl: z.string().default(''),
  gatewayPort: z.number().default(0),
  gatewayToken: z.string().default(''),
})

/** MIME for JSON probe answers. */
const JSON_TYPE = 'application/json; charset=utf-8'

/** One probe result row. */
interface ProbeRow {
  port: number
  alive: boolean
  status: number
}

/** GET one local URL with a short timeout; resolve {status, body} or reject. */
async function request(url: string, timeoutMs = 600): Promise<{ status: number; body: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    return { status: res.status, body: await res.text() }
  } finally {
    clearTimeout(timer)
  }
}

/** Is this local port a live DSH instance (index.html carries __DSH_BOOT__)? */
async function probePort(port: number): Promise<ProbeRow> {
  try {
    const { status, body } = await request(`http://127.0.0.1:${port}/`)
    return { port, alive: status === 200 && body.includes('__DSH_BOOT__'), status }
  } catch {
    return { port, alive: false, status: 0 }
  }
}

/** Concurrent probe of many ports (bounded chunking). */
async function probePorts(ports: number[]): Promise<ProbeRow[]> {
  const CHUNK = 16
  const out: ProbeRow[] = []
  for (let i = 0; i < ports.length; i += CHUNK) {
    out.push(...(await Promise.all(ports.slice(i, i + CHUNK).map(port => probePort(port)))))
  }
  return out
}

/** Send a small JSON response. */
function json(res: import('node:http').ServerResponse, value: unknown, status = 200): void {
  res.writeHead(status, { 'content-type': JSON_TYPE, 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

/** One stop result row from /multi/api/stop. */
export interface StopRow {
  port: number
  ok: boolean
  /** Human-readable failure reason (absent on success). */
  error?: string
}

/**
 * Run a command and resolve its stdout text. Rejects on non-zero exit.
 * @param file - the executable path.
 * @param args - CLI arguments.
 * @returns the trimmed stdout.
 */
function execStdout(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 5000 }, (error, stdout) => {
      if (error !== null) {
        reject(error)
        return
      }
      resolve(stdout)
    })
  })
}

/**
 * Resolve the PIDs listening on a local TCP port. Windows uses `netstat`;
 * POSIX uses `lsof` (present on macOS and most Linux installs).
 * @param port - the listening port.
 * @returns the listener PIDs (possibly empty).
 */
async function listeningPids(port: number): Promise<number[]> {
  if (process.platform === 'win32') {
    const stdout = await execStdout('netstat', ['-ano', '-p', 'tcp'])
    const pids = new Set<number>()
    for (const line of stdout.split(/\r?\n/)) {
      // TCP    127.0.0.1:3080   0.0.0.0:0   LISTENING   12345
      const m = /^\s*TCP\s+([0-9.]+|\*|\[::\]):(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/.exec(line)
      if (m !== null && Number(m[2]) === port) pids.add(Number(m[3]))
    }
    return [...pids]
  }
  const stdout = await execStdout('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'])
  return stdout.split(/\s+/).map(Number).filter(pid => Number.isInteger(pid) && pid > 0)
}

/**
 * Terminate one PID. Windows uses `taskkill /F` (force); POSIX sends SIGTERM
 * then SIGKILL after a grace period.
 * @param pid - the process id to terminate.
 */
async function killPid(pid: number): Promise<void> {
  if (process.platform === 'win32') {
    await execStdout('taskkill', ['/PID', String(pid), '/F', '/T'])
    return
  }
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    // Race: process already gone — treat as terminated.
  }
  await new Promise(resolve => setTimeout(resolve, 500))
  try {
    process.kill(pid, 'SIGKILL')
  } catch {
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
export async function stopPort(port: number, selfPort: number): Promise<StopRow> {
  try {
    const pids = await listeningPids(port)
    if (pids.length === 0) {
      return { port, ok: false, error: 'no listener on this port' }
    }
    const kill = () => Promise.all(pids.map(pid => killPid(pid).catch(() => {})))
    if (port === selfPort) {
      // Let the response flush before taking ourselves down.
      setTimeout(() => { void kill() }, 250)
      return { port, ok: true }
    }
    await kill()
    return { port, ok: true }
  } catch (error) {
    return { port, ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** How a new `dsh web` process is spawned. */
interface Launcher {
  file: string
  args: string[]
  /** Resolve `file` through the shell (needed for the Windows .cmd shim). */
  shell: boolean
}

/**
 * Resolve how to launch a new DSH instance. Primary path: the current
 * process's own entry (`node <bin> web` under `process.argv[1]`), so the new
 * instance inherits the exact CLI/profile already running. Fallback: the
 * `dsh` command from PATH when the entry cannot be derived (unusual host
 * launcher, missing file).
 * @returns the launcher description.
 */
function resolveLauncher(): Launcher {
  const first = process.argv[1]
  if (first !== undefined && existsSync(first)) {
    return { file: process.execPath, args: [first, 'web', '--port'], shell: false }
  }
  return { file: 'dsh', args: ['web', '--port'], shell: process.platform === 'win32' }
}

/**
 * Probe whether a local TCP port is already listening (no HTTP needed).
 * @param port - the port to check.
 * @returns whether something listens on it.
 */
async function isPortBusy(port: number): Promise<boolean> {
  try {
    const pids = await listeningPids(port)
    return pids.length > 0
  } catch {
    return true // probe failure is treated as busy (fail loud)
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
async function pickFreePort(lo: number, hi: number, selfPort: number): Promise<number | undefined> {
  for (let port = lo; port <= hi; port++) {
    if (port === selfPort) continue
    if (await isPortBusy(port)) continue
    return port
  }
  return undefined
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
async function startInstance(launcher: Launcher, port: number, timeoutMs = 20000): Promise<{ ok: boolean; port: number; error?: string }> {
  const child = spawn(launcher.file, [...launcher.args, String(port)], {
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true,
    shell: launcher.shell,
  })
  child.unref()
  let stderr = ''
  // Held by property so flow analysis cannot conclude the closure assignment
  // never runs (a local assigned only inside a callback narrows to never at
  // the check).
  const spawnFailure: { error: Error | null } = { error: null }
  child.stderr?.on('data', chunk => {
    stderr += String(chunk)
    if (stderr.length > 2000) stderr = stderr.slice(-2000)
  })
  child.once('error', error => { spawnFailure.error = error })
  const detail = (): string => {
    const tail = stderr.trim().split(/\r?\n/).slice(-3).join(' | ')
    return tail === '' ? '' : ` (${tail})`
  }
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (spawnFailure.error !== null) {
      return { ok: false, port, error: `new instance failed to start: ${spawnFailure.error.message}` }
    }
    if (child.exitCode !== null) {
      return { ok: false, port, error: `new instance exited early (code ${child.exitCode})${detail()}` }
    }
    const row = await probePort(port)
    if (row.alive) return { ok: true, port }
    if (Date.now() > deadline) {
      return { ok: false, port, error: `instance did not become ready in time${detail()}` }
    }
    await new Promise(resolve => setTimeout(resolve, 400))
  }
}

/**
 * The non-loopback IPv4 addresses of this machine (the LAN reachable URLs).
 * @returns the address list (possibly empty).
 */
function lanAddresses(): string[] {
  const out: string[] = []
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) out.push(iface.address)
    }
  }
  return out
}

/**
 * Register the probe routes. Everything lives under `/multi/api` so the
 * plugin is purely additive: exact `ports` (auto-discovery) and `status`
 * (liveness of a specific port list).
 * @param ctx - plugin context carrying the webServer service.
 * @param config - validated {@link MultiWallConfig}.
 */
export function apply(ctx: Context, config: MultiWallConfig = {}): void {
  const scanFrom = config.scanFrom ?? 3070
  const scanTo = config.scanTo ?? 3110
  const fixedPorts = config.ports ?? []

  // Inline gateway state: lazily started on first `/multi/api/link` call and
  // reused until the target port changes (or the instance restarts).
  let gateway: GatewayHandle | null = null
  let gatewayTargetPort = -1

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/multi/api/ports',
    handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405)
        res.end()
        return
      }
      const url = new URL(req.url ?? '/', 'http://x')
      const qFromRaw = url.searchParams.get('from')
      const qToRaw = url.searchParams.get('to')
      const qFrom = qFromRaw !== null ? Number(qFromRaw) : NaN
      const qTo = qToRaw !== null ? Number(qToRaw) : NaN
      const lo = Number.isInteger(qFrom) ? qFrom : scanFrom
      const hi = Number.isInteger(qTo) ? qTo : scanTo
      const ports = fixedPorts.length > 0 ? [...fixedPorts] : []
      if (fixedPorts.length === 0) {
        for (let p = lo; p <= hi; p++) ports.push(p)
      }
      // The serving instance is a discoverable target too: the user may want
      // to watch (or stop) the very instance hosting the wall. Recursion is
      // prevented client-side by the ?multi-wall=embed pane flag, not by
      // hiding the self port.
      probePorts(ports).then(results => {
        json(res, { ports: results.filter(row => row.alive) })
      }).catch(() => json(res, { ports: [] }, 500))
    },
  }), 'multi-wall: /multi/api/ports')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/multi/api/status',
    handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405)
        res.end()
        return
      }
      const url = new URL(req.url ?? '/', 'http://x')
      const ports = (url.searchParams.get('ports') ?? '')
        .split(',')
        .map(Number)
        .filter(p => Number.isInteger(p) && p > 0)
      probePorts(ports).then(results => {
        json(res, { ports: results })
      }).catch(() => json(res, { ports: [] }, 500))
    },
  }), 'multi-wall: /multi/api/status')

  // Terminate the DSH instance on a specific port (closes that session).
  // GET /multi/api/stop?port=3080  or  ?ports=3080,3081
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/multi/api/stop',
    handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => {
      if (req.method !== 'GET' && req.method !== 'POST') {
        res.writeHead(405)
        res.end()
        return
      }
      const url = new URL(req.url ?? '/', 'http://x')
      const raw = url.searchParams.get('ports') ?? url.searchParams.get('port') ?? ''
      const ports = raw.split(',').map(Number).filter(p => Number.isInteger(p) && p > 0)
      const selfPort = ctx.webServer.port
      Promise.all(ports.map(port => stopPort(port, selfPort))).then(results => {
        json(res, { ports: results })
      }).catch(() => json(res, { ports: [] }, 500))
    },
  }), 'multi-wall: /multi/api/stop')

  // Start a NEW DSH instance and return its port, so the wall can grow a
  // fresh window without leaving the page. Spawns `dsh web` on the first
  // free port of the scan range (never the serving port) and waits until it
  // answers the DSH shell probe.
  // POST /multi/api/create   (GET also accepted for convenience)
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/multi/api/create',
    handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => {
      if (req.method !== 'GET' && req.method !== 'POST') {
        res.writeHead(405)
        res.end()
        return
      }
      const launcher = resolveLauncher()
      const selfPort = ctx.webServer.port
      void pickFreePort(scanFrom, scanTo, selfPort).then(port => {
        if (port === undefined) {
          json(res, { ok: false, error: `no free port in ${scanFrom}–${scanTo}` }, 409)
          return
        }
        return startInstance(launcher, port).then(result => {
          json(res, result.ok ? { ok: true, port } : { ok: false, error: result.error }, result.ok ? 200 : 500)
          if (!result.ok) ctx.logger.warn(`multi-wall create failed: ${result.error}`)
        })
      }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        ctx.logger.warn(`multi-wall create error: ${message}`)
        json(res, { ok: false, error: message }, 500)
      })
    },
  }), 'multi-wall: /multi/api/create')

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
    handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405)
        res.end()
        return
      }
      const port = ctx.webServer.port
      const host = ctx.webServer.host
      const publicUrl = (config.publicUrl ?? '').replace(/\/+$/, '')
      if (publicUrl !== '') {
        json(res, { port, host, lan: [`${publicUrl}/`], reachable: true })
        return
      }

      // Ensure the inline gateway targets THIS instance's port.
      const ensureGateway = (): Promise<GatewayHandle> => {
        if (gateway !== null && gatewayTargetPort === port) {
          return Promise.resolve(gateway)
        }
        // Target changed (or first start): close the stale gateway first.
        if (gateway !== null) {
          gateway.close()
          gateway = null
        }
        const token = config.gatewayToken && config.gatewayToken !== '' ? config.gatewayToken : randomBytes(6).toString('hex')
        const gatewayPort = config.gatewayPort && config.gatewayPort !== 0 ? config.gatewayPort : port + 5000
        gatewayTargetPort = port
        return startGateway({
          targetPort: port,
          port: gatewayPort,
          token,
          name: 'DSH',
          log: (msg) => ctx.logger.info(`multi-wall gateway: ${msg}`),
        }).then(handle => {
          gateway = handle
          return handle
        })
      }

      ensureGateway().then(handle => {
        const urls = lanAddresses().map(ip => `http://${ip}:${handle.port}/`)
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
        })
      }).catch((error: unknown) => {
        ctx.logger.warn(`multi-wall gateway start failed: ${error instanceof Error ? error.message : String(error)}`)
        json(res, {
          port,
          host,
          lan: [],
          reachable: false,
          hint: error instanceof Error ? error.message : String(error),
        }, 500)
      })
    },
  }), 'multi-wall: /multi/api/link')
}
