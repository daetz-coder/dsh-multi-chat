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
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type MultiWallKey } from './locales.ts';
export { WallView } from './WallView.tsx';
export type { WallViewProps } from './WallView.tsx';
export { WallToggle } from './WallToggle.tsx';
export type { WallToggleProps } from './WallToggle.tsx';
export type { MultiWallKey } from './locales.ts';
export { createWallStore } from './store.ts';
export type { WallState, WallActions } from './store.ts';
export type { ProbeRow, StopRow, WallInjected } from './wall-injected.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Multi-window wall copy. */
        multiWall: MultiWallKey;
    }
}
/** Required services: slots for both registrations, locale for copy. */
export declare const inject: string[];
/**
 * Client plugin body: register the dictionaries, the view-ring entry (the
 * wall), and the sidebar footer shortcut. Embedded panes register nothing.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map