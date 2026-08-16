/**
 * WallToggle: the sidebar-foot shortcut. Clicking it opens the wall view —
 * the `conversation.view` ring switches to the 'multi-wall' entry, which the
 * header renders as the "多窗口墙" tab. The click is a plain user-equivalent
 * activation: it finds the header's view-ring tab for this plugin's label and
 * clicks it, so the official view-ring state machine (the chat store's active
 * view field) performs the switch. No store is declared: the ring decides
 * what renders, so this row owns no state.
 *
 * Session-scoped by design: the view ring (and its header tabs) only renders
 * with an active session, so the shortcut is inert on the empty-hero screen —
 * the user first opens or creates a session (the official flow), after which
 * the tab is present and the click lands.
 */
import { IconFullscreenOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './WallToggle.module.css'

/** Composed props: sidebar column state + locale. */
export type WallToggleProps =
  & PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<'multiWall'>

/**
 * Render the wall shortcut row (icon; label only in the wide column).
 * @param props - composed slot props.
 * @returns the shortcut row.
 */
export function WallToggle({ wide, t }: WallToggleProps) {
  return (
    <button
      type="button"
      className={css.row}
      aria-label={t('toggle.aria')}
      title={t('toggle')}
      onClick={() => {
        // The official view ring renders the active entry through
        // `only: <active id>`; the only sanctioned way to move it is the
        // header tab's click handler (actions.setView). Trigger that same
        // element instead of reaching into the chat store from the root
        // scope. No tab (no active session) is a no-op.
        const label = t('view.multiWall')
        const tab = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
          .find(el => el.textContent?.trim() === label)
        tab?.click()
      }}
    >
      <IconFullscreenOutline16 size={wide ? 16 : 18} />
      {wide && <span className={css.label}>{t('toggle')}</span>}
    </button>
  )
}
