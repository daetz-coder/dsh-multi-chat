/**
 * Multi-window wall plugin, node half: registers the `/multi/api/*` routes
 * on the webserver. The browser half fetches these same-origin to discover
 * which local ports are live DSH instances, to poll liveness, and to
 * terminate a chosen instance (`/multi/api/stop`). The wall itself is pure
 * UI — this half answers a few small JSON requests.
 * @module dsh-multi-chat
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Stable Cordis plugin name. */
export declare const name = "dsh-multi-chat";
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
    /**
     * External base URL reported by `/multi/api/link` (e.g. the authenticated
     * gateway in front of this loopback instance). When set, the link route
     * answers `{ lan: [publicUrl + '/'], reachable: true }`.
     */
    publicUrl?: string;
    /**
     * Gateway listen port for the inline phone-access gateway. `0` (default)
     * means `targetPort + 5000`.
     */
    gatewayPort?: number;
    /**
     * Optional fixed login token for the inline gateway. Empty (default) means
     * a random token is generated per gateway start (returned by /multi/api/link).
     */
    gatewayToken?: string;
    /**
     * Launch tokens for locally started instances, keyed by port.
     *
     * Since DSH 0.2 every `dsh web` process mints one launch token and answers an
     * unauthenticated `/` with 401, so a probe without it marks the instance
     * dead. `dsh-multi-chat start` records the tokens it captures in
     * `$DSH_HOME/multi-wall-instances.json`, which is read automatically;
     * instances started some other way can be added here by hand.
     */
    tokens?: Record<string, string>;
}
/** Schema-validated config (the Loader resolves defaults for absent keys). */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    scanFrom: z<number, number, "defined">;
    scanTo: z<number, number, "defined">;
    ports: z<number[], number[], "defined">;
    publicUrl: z<string, string, "defined">;
    gatewayPort: z<number, number, "defined">;
    gatewayToken: z<string, string, "defined">;
    tokens: z<import("@deepseek-ai/cosmokit").Dict<string, string>, import("@deepseek-ai/cosmokit").Dict<string, string>, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    scanFrom: z<number, number, "defined">;
    scanTo: z<number, number, "defined">;
    ports: z<number[], number[], "defined">;
    publicUrl: z<string, string, "defined">;
    gatewayPort: z<number, number, "defined">;
    gatewayToken: z<string, string, "defined">;
    tokens: z<import("@deepseek-ai/cosmokit").Dict<string, string>, import("@deepseek-ai/cosmokit").Dict<string, string>, "defined">;
}>>, "plain">;
/** One stop result row from /multi/api/stop. */
export interface StopRow {
    port: number;
    ok: boolean;
    /** Human-readable failure reason (absent on success). */
    error?: string;
}
/**
 * Terminate the DSH instance listening on one local port. The port serving
 * this wall may also be terminated (the user may want to stop the instance
 * they are viewing): the kill is deferred a beat so the HTTP response is
 * written before the process dies, then the listener's PIDs are force-killed.
 * @param port - the target port.
 * @param selfPort - this instance's own listening port.
 * @returns the stop result.
 */
export declare function stopPort(port: number, selfPort: number): Promise<StopRow>;
/**
 * Register the probe routes. Everything lives under `/multi/api` so the
 * plugin is purely additive: exact `ports` (auto-discovery) and `status`
 * (liveness of a specific port list).
 * @param ctx - plugin context carrying the webServer service.
 * @param config - validated {@link MultiWallConfig}.
 */
export declare function apply(ctx: Context, config?: MultiWallConfig): void;
//# sourceMappingURL=index.d.ts.map