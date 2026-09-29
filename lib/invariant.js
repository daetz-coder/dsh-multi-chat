//#region src/invariant.ts
const PACKAGE_NAME = "dsh-multi-chat";
/** Cordis companion plugin name. */
const name = "dsh-multi-chat-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* No runtime invariant: the wall contributes the conversation view-ring entry
* (the wall surface) and the sidebar footer shortcut, whose disposal is
* proven by the HMR-safety spec — the plugin owns one store handle used by
* the view entry, emits no cordis events, and holds no cross-plugin mutable
* state.
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