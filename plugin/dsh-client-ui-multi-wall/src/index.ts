/**
 * Multi-window wall plugin, node half: registers the `/multi/api/*` probe
 * routes on the webserver. The browser half fetches these same-origin to
 * discover which local ports are live DSH instances and to poll liveness.
 * The wall itself is pure UI — this half only answers two small JSON GETs.
 * @module @deepseek-ai/dsh-client-ui-multi-wall
 */

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
      const qFrom = Number(url.searchParams.get('from'))
      const qTo = Number(url.searchParams.get('to'))
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
}
