//#region lib/types/invariant.js
/**
* Package-owned invariant companion for
* `@deepseek-ai/dsh-client-ui-multi-wall`.
* @module @deepseek-ai/dsh-client-ui-multi-wall/invariant
*/
const PACKAGE_NAME = "@deepseek-ai/dsh-client-ui-multi-wall";
/** Cordis companion plugin name. */
const name = "client-ui-multi-wall-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* No runtime invariant: the wall registers two additive slots (sidebar footer
* toggle + shell overlay) whose disposal is proven by the HMR-safety spec —
* the plugin owns one store handle shared by both registrations, emits no
* cordis events, and holds no cross-plugin mutable state.
*/
const install = () => {};
/**
* Register this package's invariant companion.
* @param ctx - Cordis context carrying the invariant service.
* @returns the installed registration's disposer after setup succeeds.
*/
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
