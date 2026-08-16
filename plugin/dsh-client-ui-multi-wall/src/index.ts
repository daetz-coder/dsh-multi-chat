/**
 * Multi-window wall plugin, node half: registers the `/multi/api/*` routes
 * on the webserver. The browser half fetches these same-origin to discover
 * which local ports are live DSH instances, to poll liveness, and to
 * terminate a chosen instance (`/multi/api/stop`). The wall itself is pure
 * UI — this half answers a few small JSON requests.
 * @module @deepseek-ai/dsh-client-ui-multi-wall
 */

import { execFile } from 'node:child_process'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-host-webserver'

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
}

/** Schema-validated config (the Loader resolves defaults for absent keys). */
export const Config = z.object({
  scanFrom: z.natural().default(3070),
  scanTo: z.natural().default(3110),
  ports: z.array(z.natural()).default([]),
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
 * Terminate the DSH instance listening on one local port. Refuses the port
 * this very instance serves (killing the page hosting the wall would drop
 * the response mid-flight).
 * @param port - the target port.
 * @param selfPort - this instance's own listening port.
 * @returns the stop result.
 */
export async function stopPort(port: number, selfPort: number): Promise<StopRow> {
  if (port === selfPort) {
    return { port, ok: false, error: 'refusing to stop the instance serving this wall' }
  }
  try {
    const pids = await listeningPids(port)
    if (pids.length === 0) {
      return { port, ok: false, error: 'no listener on this port' }
    }
    await Promise.all(pids.map(pid => killPid(pid).catch(() => {})))
    return { port, ok: true }
  } catch (error) {
    return { port, ok: false, error: error instanceof Error ? error.message : String(error) }
  }
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
}
