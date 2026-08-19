/**
 * Injected probe face for the wall view: same-origin fetches to the node
 * half's /multi/api routes. Callbacks only — components never see ctx.
 */

/** One liveness row from /multi/api/status. */
export interface ProbeRow {
  port: number
  alive: boolean
  status: number
}

/** One stop result row from /multi/api/stop. */
export interface StopRow {
  port: number
  ok: boolean
  error?: string
}

/** One create result row from /multi/api/create. */
export interface CreateRow {
  ok: boolean
  port?: number
  error?: string
}

/** The phone-reachable link info from /multi/api/link. */
export interface LinkRow {
  port: number
  host: string
  /** LAN URLs (`http://<lan-ip>:<gateway-port>/`), possibly empty. */
  lan: string[]
  /** Whether the instance is reachable off-loopback (gateway running). */
  reachable: boolean
  /** The inline gateway's listen port (when started). */
  gatewayPort?: number
  /** The login token (generated or configured). */
  token?: string
  /** Human hint when not reachable. */
  hint?: string
}

/** The inject face delivered to the wall view registration. */
export interface WallInjected {
  /** Discover live DSH instances (same-origin /multi/api/ports). */
  discover: () => Promise<number[]>
  /** Probe liveness of specific ports (same-origin /multi/api/status). */
  probe: (ports: number[]) => Promise<ProbeRow[]>
  /** Terminate the DSH instance on one port (same-origin /multi/api/stop). */
  stop: (port: number) => Promise<StopRow>
  /** Start a new DSH instance and return its port (same-origin /multi/api/create). */
  create: () => Promise<CreateRow>
  /** The phone-reachable link for this instance (same-origin /multi/api/link). */
  link: () => Promise<LinkRow>
}

/**
 * Build the probe face bound to this origin's /multi/api routes.
 * @param mount - the API base path ('' at the root, '/multi' when mounted).
 * @returns the injected callbacks.
 */
export function createWallInjected(mount = ''): WallInjected {
  const base = mount.replace(/\/+$/, '')
  return {
    discover: async () => {
      const res = await fetch(`${base}/multi/api/ports`)
      if (!res.ok) return []
      const data = (await res.json()) as { ports?: { port: number; alive: boolean }[] }
      return (data.ports ?? []).filter(p => p.alive).map(p => p.port)
    },
    probe: async (ports: number[]) => {
      const res = await fetch(`${base}/multi/api/status?ports=${ports.join(',')}`)
      if (!res.ok) return []
      const data = (await res.json()) as { ports?: ProbeRow[] }
      return data.ports ?? []
    },
    stop: async (port: number) => {
      const res = await fetch(`${base}/multi/api/stop?port=${port}`, { method: 'POST' })
      if (!res.ok) return { port, ok: false, error: `HTTP ${res.status}` }
      const data = (await res.json()) as { ports?: StopRow[] }
      return data.ports?.[0] ?? { port, ok: false, error: 'no result' }
    },
    create: async () => {
      // Harden the failure surface: a non-2xx answer, an HTML fallback page
      // (route missing) or a truncated body must never degrade into the bare
      // "unknown" the UI shows for a missing error field.
      const res = await fetch(`${base}/multi/api/create`, { method: 'POST' })
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}` }
      }
      const text = await res.text()
      let data: Partial<CreateRow>
      try {
        data = JSON.parse(text) as Partial<CreateRow>
      } catch {
        const snippet = text.trim().slice(0, 120)
        return { ok: false, error: `invalid response: ${snippet === '' ? '<empty body>' : snippet}` }
      }
      if (data.ok === true) {
        return data.port !== undefined
          ? { ok: true, port: data.port }
          : { ok: false, error: 'no port in response' }
      }
      return {
        ok: false,
        ...(typeof data.error === 'string' ? { error: data.error } : { error: 'server returned no reason' }),
      }
    },
    link: async () => {
      const res = await fetch(`${base}/multi/api/link`)
      const data = (await res.json().catch(() => ({}))) as Partial<LinkRow>
      return {
        port: data.port ?? 0,
        host: data.host ?? 'unknown',
        lan: data.lan ?? [],
        reachable: data.reachable === true,
        ...(typeof data.gatewayPort === 'number' ? { gatewayPort: data.gatewayPort } : {}),
        ...(typeof data.token === 'string' ? { token: data.token } : {}),
        ...(typeof data.hint === 'string' ? { hint: data.hint } : {}),
      }
    },
  }
}
