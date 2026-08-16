/**
 * Multi-window wall plugin, browser half: registers two additive entries —
 * the `sidebar.footer.action` toggle row and the `shell.overlay` full-screen
 * wall — sharing one wall store handle. No existing slot is replaced and no
 * original interaction logic changes; the wall is pure UI over the node
 * half's /multi/api probe routes.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type MultiWallKey } from './locales.ts';
export { WallOverlay } from './WallOverlay.tsx';
export type { WallOverlayProps } from './WallOverlay.tsx';
export { WallToggle } from './WallToggle.tsx';
export type { WallToggleProps } from './WallToggle.tsx';
export type { MultiWallKey } from './locales.ts';
export { createWallStore } from './store.ts';
export type { WallState, WallActions } from './store.ts';
export type { ProbeRow, WallInjected } from './wall-injected.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Multi-window wall copy. */
        multiWall: MultiWallKey;
    }
}
/** Required services: slots for both registrations, locale for copy. */
export declare const inject: string[];
/**
 * Client plugin body: register the dictionaries and the two additive entries.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map