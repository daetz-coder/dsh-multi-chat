/**
 * Wall store: which instances are shown and the grid columns. The ports list
 * is the wall's whole business state — discovery writes it, removal filters
 * it, and the grid renders from it. Shared across the sidebar footer toggle
 * (open/closed) and the overlay (renders the grid), so one handle rides both
 * registrations.
 */
import { defineStore } from '@deepseek-ai/dsh-client-runtime/client';
/**
 * Create the wall store handle. Persisted under `dsh.multi-wall` so the wall
 * reopens on the last port set; a reload keeps discovery results.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createWallStore() {
    return defineStore({
        init: () => ({ open: false, ports: [], columns: 'auto' }),
        persist: 'dsh.multi-wall',
        actions: {
            toggle: (d) => { d.open = !d.open; },
            setOpen: (d, open) => { d.open = open; },
            setPorts: (d, ports) => { d.ports = ports; },
            addPort: (d, port) => { if (!d.ports.includes(port))
                d.ports = [...d.ports, port]; },
            removePort: (d, port) => { d.ports = d.ports.filter(p => p !== port); },
            setColumns: (d, columns) => { d.columns = columns; },
        },
    });
}
//# sourceMappingURL=store.js.map