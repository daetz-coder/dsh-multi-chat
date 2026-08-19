import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
/** Composed props: sidebar column state + locale. */
export type WallToggleProps = PropsRuntime<'sidebar.footer.action'> & PropsLocale<'multiWall'>;
/**
 * Render the wall shortcut row (icon; label only in the wide column).
 * @param props - composed slot props.
 * @returns the shortcut row.
 */
export declare function WallToggle({ wide, t }: WallToggleProps): import("react").JSX.Element;
//# sourceMappingURL=WallToggle.d.ts.map