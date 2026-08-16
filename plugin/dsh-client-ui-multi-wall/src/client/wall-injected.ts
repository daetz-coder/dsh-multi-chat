/**
 * Injected probe face for the wall overlay: same-origin fetches to the node
 * half's /multi/api routes. Callbacks only — components never see ctx.
 */

/** One liveness row from /multi/api/status. */
export interface ProbeRow {
  port: number
  alive: boolean
  status: number
}

/** The inject face delivered to the wall overlay registration. */
export interface WallInjected {
  /** Discover live DSH instances (same-origin /multi/api/ports). */
  discover: () => Promise<number[]>
  /** Probe liveness of specific ports (same-origin /multi/api/status). */
  probe: (ports: number[]) => Promise<ProbeRow[]>
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
  }
}
