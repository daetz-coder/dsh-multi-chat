/**
 * Injected probe face for the wall view: same-origin fetches to the node
 * half's /multi/api routes. Callbacks only — components never see ctx.
 */
/** One liveness row from /multi/api/status. */
export interface ProbeRow {
    port: number;
    alive: boolean;
    status: number;
}
/** One stop result row from /multi/api/stop. */
export interface StopRow {
    port: number;
    ok: boolean;
    error?: string;
}
/** One create result row from /multi/api/create. */
export interface CreateRow {
    ok: boolean;
    port?: number;
    error?: string;
}
/** The phone-reachable link info from /multi/api/link. */
export interface LinkRow {
    port: number;
    host: string;
    /** LAN URLs (`http://<lan-ip>:<gateway-port>/`), possibly empty. */
    lan: string[];
    /** Whether the instance is reachable off-loopback (gateway running). */
    reachable: boolean;
    /** The inline gateway's listen port (when started). */
    gatewayPort?: number;
    /** The login token (generated or configured). */
    token?: string;
    /** Human hint when not reachable. */
    hint?: string;
}
/** The inject face delivered to the wall view registration. */
export interface WallInjected {
    /** Discover live DSH instances (same-origin /multi/api/ports). */
    discover: () => Promise<number[]>;
    /** Probe liveness of specific ports (same-origin /multi/api/status). */
    probe: (ports: number[]) => Promise<ProbeRow[]>;
    /** Terminate the DSH instance on one port (same-origin /multi/api/stop). */
    stop: (port: number) => Promise<StopRow>;
    /** Start a new DSH instance and return its port (same-origin /multi/api/create). */
    create: () => Promise<CreateRow>;
    /** The phone-reachable link for this instance (same-origin /multi/api/link). */
    link: () => Promise<LinkRow>;
}
/**
 * Build the probe face bound to this origin's /multi/api routes.
 * @param mount - the API base path ('' at the root, '/multi' when mounted).
 * @returns the injected callbacks.
 */
export declare function createWallInjected(mount?: string): WallInjected;
//# sourceMappingURL=wall-injected.d.ts.map