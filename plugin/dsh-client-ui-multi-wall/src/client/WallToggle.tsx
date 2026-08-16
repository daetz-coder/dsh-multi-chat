/**
 * WallToggle: the sidebar-foot action row. Wide columns render an icon plus
 * the label; the collapsed rail renders the icon only (the rail sizes by
 * icon). The click toggles the shared wall store.
 */
import { IconFullscreenOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { HandleOf } from '@deepseek-ai/dsh-client-ui-slots'
import type { createWallStore } from './store.ts'
import css from './WallToggle.module.css'

/** Composed props: sidebar column state + the store share + locale. */
export type WallToggleProps =
  & PropsRuntime<'sidebar.footer.action'>
  & PropsStore<HandleOf<typeof createWallStore>>
  & PropsLocale<'multiWall'>

/**
 * Render the wall toggle row (icon; label only in the wide column).
 * @param props - composed slot props.
 * @returns the toggle row.
 */
export function WallToggle({ wide, actions, t }: WallToggleProps) {
  return (
    <button
      type="button"
      className={css.row}
      aria-label={t('toggle.aria')}
      title={t('toggle')}
      onClick={() => { actions.toggle() }}
    >
      <IconFullscreenOutline16 size={wide ? 16 : 18} />
      {wide && <span className={css.label}>{t('toggle')}</span>}
    </button>
  )
}
