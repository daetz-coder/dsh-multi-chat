/**
 * Multi-window wall plugin, browser half: contributes the wall as a
 * `conversation.view` ring entry (the official replace-the-chat-surface
 * mechanism — the header grows a "多窗口墙" tab and the right panel swaps to
 * the wall) plus a sidebar footer shortcut that jumps to that view. No
 * existing slot is replaced and no original interaction logic changes; the
 * wall is pure UI over the node half's /multi/api probe routes.
 *
 * Recursion guard: a wall pane embeds each instance as
 * `http://127.0.0.1:<port>/?multi-wall=embed`; the embedded page sees the
 * query flag and registers nothing, so a pane can never grow a wall of its
 * own. The wall also never renders the port it is served on (SELF_PORT is
 * filtered at render time and by the node half's discovery).
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the layout-owned slot declarations (sidebar footer,
// shell.overlay) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the conversation package's view-ring declaration
// ('conversation.view') into this program.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the sidebar footer action owner props into this program.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls ctx.locale into this program.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { en, zh, type MultiWallKey } from './locales.ts'
import { createWallStore } from './store.ts'
import { createWallInjected } from './wall-injected.ts'
import { WallView } from './WallView.tsx'
import { WallToggle } from './WallToggle.tsx'

export { WallView } from './WallView.tsx'
export type { WallViewProps } from './WallView.tsx'
export { WallToggle } from './WallToggle.tsx'
export type { WallToggleProps } from './WallToggle.tsx'
export type { MultiWallKey } from './locales.ts'
export { createWallStore } from './store.ts'
export type { WallState, WallActions } from './store.ts'
export type { ProbeRow, StopRow, WallInjected } from './wall-injected.ts'

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
 * Whether this page is an embedded wall pane. Panes load
 * `?multi-wall=embed`; such pages register no wall UI at all, which stops a
 * wall inside a wall (the pane would otherwise recursively embed the
 * serving instance).
 * @returns true when the query flag is present.
 */
function isEmbeddedPane(): boolean {
  return new URLSearchParams(window.location.search).has('multi-wall')
}

/**
 * Client plugin body: register the dictionaries, the view-ring entry (the
 * wall), and the sidebar footer shortcut. Embedded panes register nothing.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  if (isEmbeddedPane()) return
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-multi-wall: dictionaries')

  // Registration-time text (the view tab label) reads through the bound
  // translate as a thunk, so it follows the active locale without
  // re-registration.
  const t = ctx.locale.bind(NS)

  // One wall store handle rides both registrations (ports, columns).
  const wallStore = createWallStore()

  // The wall itself: a 'conversation.view' ring entry. The header projects
  // the tab from the registration options; selecting it swaps the right
  // panel from the chat to the wall (official view-ring behavior).
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'multi-wall',
    order: 20,
    label: () => t('view.multiWall'),
    locale: NS,
    store: wallStore,
    inject: () => createWallInjected(),
  }, WallView))

  // The sidebar footer shortcut: jumps to the wall view. It owns no state —
  // the view ring decides what renders — so it is a plain action row.
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'multi-wall',
    order: 10,
    locale: NS,
  }, WallToggle))
}
