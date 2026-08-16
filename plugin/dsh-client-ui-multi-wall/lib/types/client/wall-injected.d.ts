/**
 * Injected probe face for the wall overlay: same-origin fetches to the node
 * half's /multi/api routes. Callbacks only — components never see ctx.
 */
/** One liveness row from /multi/api/status. */
export interface ProbeRow {
    port: number;
    alive: boolean;
    status: number;
}
/** The inject face delivered to the wall overlay registration. */
export interface WallInjected {
    /** Discover live DSH instances (same-origin /multi/api/ports). */
    discover: () => Promise<number[]>;
    /** Probe liveness of specific ports (same-origin /multi/api/status). */
    probe: (ports: number[]) => Promise<ProbeRow[]>;
}
/**
 * Build the probe face bound to this origin's /multi/api routes.
 * @param mount - the API base path ('' at the root, '/multi' when mounted).
 * @returns the injected callbacks.
 */
export declare function createWallInjected(mount?: string): WallInjected;
//# sourceMappingURL=wall-injected.d.ts.map