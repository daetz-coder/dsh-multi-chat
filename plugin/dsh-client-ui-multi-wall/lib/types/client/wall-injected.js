/**
 * Injected probe face for the wall view: same-origin fetches to the node
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
        stop: async (port) => {
            const res = await fetch(`${base}/multi/api/stop?port=${port}`, { method: 'POST' });
            if (!res.ok)
                return { port, ok: false, error: `HTTP ${res.status}` };
            const data = (await res.json());
            return data.ports?.[0] ?? { port, ok: false, error: 'no result' };
        },
        create: async () => {
            // Harden the failure surface: a non-2xx answer, an HTML fallback page
            // (route missing) or a truncated body must never degrade into the bare
            // "unknown" the UI shows for a missing error field.
            const res = await fetch(`${base}/multi/api/create`, { method: 'POST' });
            if (!res.ok) {
                return { ok: false, error: `HTTP ${res.status}` };
            }
            const text = await res.text();
            let data;
            try {
                data = JSON.parse(text);
            }
            catch {
                const snippet = text.trim().slice(0, 120);
                return { ok: false, error: `invalid response: ${snippet === '' ? '<empty body>' : snippet}` };
            }
            if (data.ok === true) {
                return data.port !== undefined
                    ? { ok: true, port: data.port }
                    : { ok: false, error: 'no port in response' };
            }
            return {
                ok: false,
                ...(typeof data.error === 'string' ? { error: data.error } : { error: 'server returned no reason' }),
            };
        },
        link: async () => {
            const res = await fetch(`${base}/multi/api/link`);
            const data = (await res.json().catch(() => ({})));
            return {
                port: data.port ?? 0,
                host: data.host ?? 'unknown',
                lan: data.lan ?? [],
                reachable: data.reachable === true,
                ...(typeof data.hint === 'string' ? { hint: data.hint } : {}),
            };
        },
    };
}
//# sourceMappingURL=wall-injected.js.map