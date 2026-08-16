import type { PropsLocale, PropsStore } from '@deepseek-ai/dsh-client-ui-slots';
import type { HandleOf } from '@deepseek-ai/dsh-client-ui-slots';
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { createWallStore } from './store.ts';
import type { WallInjected } from './wall-injected.ts';
/** Composed props: the view-ring runtime share, the store, the probe face, and locale. */
export type WallViewProps = ConvViewProps & PropsStore<HandleOf<typeof createWallStore>> & WallInjected & PropsLocale<'multiWall'>;
/**
 * Render the wall: toolbar plus the horizontally-filled pane grid. Discovery
 * runs on mount and liveness polls every 5s; the store's persisted ports
 * survive view switches and reloads.
 * @param props - composed slot props.
 * @returns the wall surface.
 */
export declare function WallView({ useStore, actions, discover, probe, stop, create, link, t }: WallViewProps): import("react").JSX.Element;
//# sourceMappingURL=WallView.d.ts.map