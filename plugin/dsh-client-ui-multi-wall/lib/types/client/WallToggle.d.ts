import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots';
import type { HandleOf } from '@deepseek-ai/dsh-client-ui-slots';
import type { createWallStore } from './store.ts';
/** Composed props: sidebar column state + the store share + locale. */
export type WallToggleProps = PropsRuntime<'sidebar.footer.action'> & PropsStore<HandleOf<typeof createWallStore>> & PropsLocale<'multiWall'>;
/**
 * Render the wall toggle row (icon; label only in the wide column).
 * @param props - composed slot props.
 * @returns the toggle row.
 */
export declare function WallToggle({ wide, actions, t }: WallToggleProps): import("react").JSX.Element;
//# sourceMappingURL=WallToggle.d.ts.map