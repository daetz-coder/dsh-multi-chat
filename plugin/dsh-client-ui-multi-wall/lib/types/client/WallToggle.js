import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * WallToggle: the sidebar-foot action row. Wide columns render an icon plus
 * the label; the collapsed rail renders the icon only (the rail sizes by
 * icon). The click toggles the shared wall store.
 */
import { IconFullscreenOutline16 } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './WallToggle.module.css';
/**
 * Render the wall toggle row (icon; label only in the wide column).
 * @param props - composed slot props.
 * @returns the toggle row.
 */
export function WallToggle({ wide, actions, t }) {
    return (_jsxs("button", { type: "button", className: css.row, "aria-label": t('toggle.aria'), title: t('toggle'), onClick: () => { actions.toggle(); }, children: [_jsx(IconFullscreenOutline16, { size: wide ? 16 : 18 }), wide && _jsx("span", { className: css.label, children: t('toggle') })] }));
}
//# sourceMappingURL=WallToggle.js.map