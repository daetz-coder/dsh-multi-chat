/**
 * Wall store: which instances are shown and the grid columns. The ports list
 * is the wall's whole business state — discovery writes it, removal filters
 * it, and the grid renders from it. Shared across the sidebar footer toggle
 * (open/closed) and the overlay (renders the grid), so one handle rides both
 * registrations.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

/** Wall viewing state: open flag, displayed ports, grid columns. */
export type WallState = {
  open: boolean
  ports: number[]
  columns: string
}

/** The wall store's complete write set. */
export type WallActions = {
  toggle: (draft: WallState) => void
  setOpen: (draft: WallState, open: boolean) => void
  setPorts: (draft: WallState, ports: number[]) => void
  addPort: (draft: WallState, port: number) => void
  removePort: (draft: WallState, port: number) => void
  setColumns: (draft: WallState, columns: string) => void
}

/**
 * Create the wall store handle. Persisted under `dsh.multi-wall` so the wall
 * reopens on the last port set; a reload keeps discovery results.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createWallStore(): EngineStoreHandle<WallState, WallActions> {
  return defineStore({
    init: (): WallState => ({ open: false, ports: [], columns: 'auto' }),
    persist: 'dsh.multi-wall',
    actions: {
      toggle: (d) => { d.open = !d.open },
      setOpen: (d, open: boolean) => { d.open = open },
      setPorts: (d, ports: number[]) => { d.ports = ports },
      addPort: (d, port: number) => { if (!d.ports.includes(port)) d.ports = [...d.ports, port] },
      removePort: (d, port: number) => { d.ports = d.ports.filter(p => p !== port) },
      setColumns: (d, columns: string) => { d.columns = columns },
    },
  })
}
