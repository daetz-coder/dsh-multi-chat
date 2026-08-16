/**
 * Multi-window wall plugin, browser half: registers two additive entries —
 * the `sidebar.footer.action` toggle row and the `shell.overlay` full-screen
 * wall — sharing one wall store handle. No existing slot is replaced and no
 * original interaction logic changes; the wall is pure UI over the node
 * half's /multi/api probe routes.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the layout-owned slot declarations (shell.overlay) and the
// sidebar footer action owner props into this program.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls ctx.locale into this program.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { en, zh, type MultiWallKey } from './locales.ts'
import { createWallStore } from './store.ts'
import { createWallInjected } from './wall-injected.ts'
import { WallOverlay } from './WallOverlay.tsx'
import { WallToggle } from './WallToggle.tsx'

export { WallOverlay } from './WallOverlay.tsx'
export type { WallOverlayProps } from './WallOverlay.tsx'
export { WallToggle } from './WallToggle.tsx'
export type { WallToggleProps } from './WallToggle.tsx'
export type { MultiWallKey } from './locales.ts'
export { createWallStore } from './store.ts'
export type { WallState, WallActions } from './store.ts'
export type { ProbeRow, WallInjected } from './wall-injected.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Multi-window wall copy. */
    multiWall: MultiWallKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'multiWall'

/** Required services: slots for both registrations, locale for copy. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: register the dictionaries and the two additive entries.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-multi-wall: dictionaries')

  // One wall store handle rides both registrations (open flag, ports, columns).
  const wallStore = createWallStore()

  // The wall overlay entry: full-screen, additive, click-through layer opt-in.
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'multi-wall',
    order: 10,
    locale: NS,
    store: wallStore,
    inject: () => createWallInjected(),
  }, WallOverlay))

  // The sidebar footer toggle row, above Settings in both widths.
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'multi-wall',
    order: 10,
    locale: NS,
    store: wallStore,
  }, WallToggle))
}
