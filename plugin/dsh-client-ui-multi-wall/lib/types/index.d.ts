/**
 * Multi-window wall plugin, node half: registers the `/multi/api/*` probe
 * routes on the webserver. The browser half fetches these same-origin to
 * discover which local ports are live DSH instances and to poll liveness.
 * The wall itself is pure UI — this half only answers two small JSON GETs.
 * @module @deepseek-ai/dsh-client-ui-multi-wall
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Stable Cordis plugin name. */
export declare const name = "client-ui-multi-wall";
/** Services required before the probe routes can be registered. */
export declare const inject: string[];
/** Plugin config: the wall's auto-discovery scan range. */
export interface MultiWallConfig {
    /** First port of the auto-discovery range. */
    scanFrom?: number;
    /** Last port of the auto-discovery range. */
    scanTo?: number;
    /** Optional fixed port list; when set, discovery ignores the scan range. */
    ports?: number[];
}
/** Schema-validated config (the Loader resolves defaults for absent keys). */
export declare const Config: z<Schemastery.ObjectS<{
    scanFrom: z<number, number>;
    scanTo: z<number, number>;
    ports: z<number[], number[]>;
}>, Schemastery.ObjectT<{
    scanFrom: z<number, number>;
    scanTo: z<number, number>;
    ports: z<number[], number[]>;
}>>;
/**
 * Register the probe routes. Everything lives under `/multi/api` so the
 * plugin is purely additive: exact `ports` (auto-discovery) and `status`
 * (liveness of a specific port list).
 * @param ctx - plugin context carrying the webServer service.
 * @param config - validated {@link MultiWallConfig}.
 */
export declare function apply(ctx: Context, config?: MultiWallConfig): void;
//# sourceMappingURL=index.d.ts.map