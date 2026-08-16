import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots';
import type { HandleOf } from '@deepseek-ai/dsh-client-ui-slots';
import type { createWallStore } from './store.ts';
import type { WallInjected } from './wall-injected.ts';
/** Composed props: the store share, the injected probe face, and locale. */
export type WallOverlayProps = PropsRuntime<'shell.overlay'> & PropsStore<HandleOf<typeof createWallStore>> & WallInjected & PropsLocale<'multiWall'>;
/**
 * Render the wall when open, nothing otherwise. Discovery runs on open;
 * liveness polls every 5s while open.
 * @param props - composed slot props.
 * @returns the wall surface or null.
 */
export declare function WallOverlay({ useStore, actions, discover, probe, t }: WallOverlayProps): import("react").JSX.Element | null;
//# sourceMappingURL=WallOverlay.d.ts.map