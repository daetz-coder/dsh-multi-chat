/**
 * Wall store: which instances are shown and the grid columns. The ports list
 * is the wall's whole business state — discovery writes it, removal filters
 * it, and the grid renders from it. Open/closed is NOT stored here: the wall
 * is a `conversation.view` ring entry, so the active view (chat store's
 * `view` field) decides whether it renders.
 */
import { defineStore } from '@deepseek-ai/dsh-client-runtime/client';
/**
 * Create the wall store handle. Persisted under `dsh.multi-wall` so the port
 * set and column choice survive view switches and reloads.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createWallStore() {
    return defineStore({
        init: () => ({ ports: [], columns: 'auto' }),
        persist: 'dsh.multi-wall',
        actions: {
            setPorts: (d, ports) => { d.ports = ports; },
            addPort: (d, port) => { if (!d.ports.includes(port))
                d.ports = [...d.ports, port]; },
            removePort: (d, port) => { d.ports = d.ports.filter(p => p !== port); },
            setColumns: (d, columns) => { d.columns = columns; },
        },
    });
}
//# sourceMappingURL=store.js.map