/**
 * Injected probe face for the wall overlay: same-origin fetches to the node
 * half's /multi/api routes. Callbacks only — components never see ctx.
 */
/**
 * Build the probe face bound to this origin's /multi/api routes.
 * @param mount - the API base path ('' at the root, '/multi' when mounted).
 * @returns the injected callbacks.
 */
export function createWallInjected(mount = '') {
    const base = mount.replace(/\/+$/, '');
    return {
        discover: async () => {
            const res = await fetch(`${base}/multi/api/ports`);
            if (!res.ok)
                return [];
            const data = (await res.json());
            return (data.ports ?? []).filter(p => p.alive).map(p => p.port);
        },
        probe: async (ports) => {
            const res = await fetch(`${base}/multi/api/status?ports=${ports.join(',')}`);
            if (!res.ok)
                return [];
            const data = (await res.json());
            return data.ports ?? [];
        },
    };
}
//# sourceMappingURL=wall-injected.js.map