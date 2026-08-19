/**
 * Inline authenticated gateway for the multi-wall plugin's node half.
 *
 * The official `dsh web` CLI forbids `--host 0.0.0.0` (it would expose remote
 * code execution to the network), so reaching a loopback-only DSH instance
 * from a phone/another machine needs an auth-gated gateway in front of it.
 *
 * This module embeds that gateway directly in the plugin (no external
 * `gateway.mjs` file needed at runtime): a raw TCP listener that authenticates
 * a token (HMAC-signed session cookie), then transparently proxies to
 * `127.0.0.1:<target-port>`, rewriting Host/Origin so the official `/api`
 * browser-trust fence treats it as a local request. WebSocket upgrades pass
 * through untouched because the socket is piped byte-for-byte after the head.
 * The HTML document response is buffered once so a `crypto.randomUUID`
 * polyfill can be injected for phones (insecure-origin HTTP); all other
 * responses stream through unchanged.
 *
 * Zero dependencies: node:net + node:crypto only.
 * @module dsh-multi-chat/gateway
 */
/** Options for {@link startGateway}. */
export interface GatewayOptions {
    /** Loopback target port (the DSH instance to proxy by default). */
    targetPort: number;
    /** Listen port; pass 0 to let the OS pick one. */
    port: number;
    /** Login token (secret). */
    token: string;
    /** Instance label shown on the login page. */
    name: string;
    /** Session cookie lifetime in hours. */
    maxAgeHours?: number;
    /**
     * When set, the gateway routes `/gw/<port>/<path>` to `127.0.0.1:<port>`
     * for any port in this list (the wall's phone panes). Other ports are
     * rejected, so the phone cannot reach arbitrary loopback services.
     */
    routedPorts?: number[];
    /** Log lines (startup, login events). */
    log?: (message: string) => void;
}
/** Handle returned by {@link startGateway}. */
export interface GatewayHandle {
    /** The OS-assigned listen port (equals `port` unless it was 0). */
    port: number;
    /** The login token. */
    token: string;
    /** Close the gateway listener. */
    close: () => void;
}
/**
 * Start an in-process authenticated gateway for one loopback DSH instance.
 * @param options - target, listen port, token, label, and lifetime.
 * @returns a handle with the assigned port and token, and a close().
 */
export declare function startGateway(options: GatewayOptions): Promise<GatewayHandle>;
//# sourceMappingURL=gateway.d.ts.map