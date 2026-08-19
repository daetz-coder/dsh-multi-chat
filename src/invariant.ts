/**
 * Package-owned invariant companion for
 * `@deepseek-ai/dsh-client-ui-multi-wall`.
 * @module @deepseek-ai/dsh-client-ui-multi-wall/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-multi-wall'

/** Cordis companion plugin name. */
export const name = 'client-ui-multi-wall-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the wall contributes the conversation view-ring entry
 * (the wall surface) and the sidebar footer shortcut, whose disposal is
 * proven by the HMR-safety spec — the plugin owns one store handle used by
 * the view entry, emits no cordis events, and holds no cross-plugin mutable
 * state.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
