import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * WallOverlay: the full-screen wall surface, mounted through the
 * `shell.overlay` list slot (frame-wide, additive). Renders nothing while
 * the store is closed; when open it covers the app with a toolbar and a grid
 * of iframes — one pane per running DSH instance (127.0.0.1:<port>).
 *
 * Live data channels: the store owns open/ports/columns; discovery writes
 * `setPorts` from /multi/api/ports (same-origin, served by the node half);
 * per-pane liveness arrives from /multi/api/status polls. Components never
 * see ctx — the fetch helpers are injected through the registration.
 */
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { IconCloseOutline16, IconFullscreenOutline16, IconRefreshOutline16, IconRightUpOutline16, } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './WallOverlay.module.css';
/** Grid column presets, driven by the toolbar select. */
const COLUMN_PRESETS = ['auto', '1', '2', '3', '4', '6'];
/**
 * One pane: header (port, liveness dot, zoom/refresh/open/remove) plus the
 * embedded original DSH UI.
 */
function WallPane(props) {
    const { port, alive, zoomed, onZoom, onRemove, t } = props;
    return (_jsxs("section", { className: clsx(css.pane, zoomed && css.zoomed), "data-port": port, children: [_jsxs("div", { className: css.paneHead, children: [_jsx("span", { className: clsx(css.dot, alive ? css.ok : css.bad), "aria-hidden": "true" }), _jsxs("span", { className: css.paneTitle, children: ["127.0.0.1:", port] }), _jsxs("div", { className: css.paneActions, children: [_jsx("button", { type: "button", className: css.action, title: t('zoom'), onClick: onZoom, children: _jsx(IconFullscreenOutline16, { size: 14 }) }), _jsx("button", { type: "button", className: css.action, title: t('reload'), onClick: (e) => {
                                    e.currentTarget.closest('section')?.querySelector('iframe')?.contentWindow?.location.reload();
                                }, children: _jsx(IconRefreshOutline16, { size: 14 }) }), _jsx("button", { type: "button", className: css.action, title: t('openTab'), onClick: () => {
                                    window.open(`http://127.0.0.1:${port}/`, '_blank');
                                }, children: _jsx(IconRightUpOutline16, { size: 14 }) }), _jsx("button", { type: "button", className: clsx(css.action, css.danger), title: t('remove'), onClick: onRemove, children: _jsx(IconCloseOutline16, { size: 14 }) })] })] }), _jsx("div", { className: css.paneBody, children: _jsx("iframe", { title: `DSH :${port}`, src: `http://127.0.0.1:${port}/`, loading: "lazy", sandbox: "allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads" }) })] }));
}
/**
 * Render the wall when open, nothing otherwise. Discovery runs on open;
 * liveness polls every 5s while open.
 * @param props - composed slot props.
 * @returns the wall surface or null.
 */
export function WallOverlay({ useStore, actions, discover, probe, t }) {
    const open = useStore(s => s.open);
    const ports = useStore(s => s.ports);
    const columns = useStore(s => s.columns);
    const [alive, setAlive] = useState({});
    const [zoomedPort, setZoomedPort] = useState(null);
    const [scanFrom, setScanFrom] = useState(3070);
    const [scanTo, setScanTo] = useState(3110);
    const [status, setStatus] = useState('');
    const aliveRef = useRef({});
    aliveRef.current = alive;
    // Discover on first open, then poll liveness while open.
    useEffect(() => {
        if (!open)
            return;
        void discover().then(ports => {
            if (ports.length > 0)
                actions.setPorts(ports);
            setStatus(ports.length > 0 ? t('status.found').replace('{count}', String(ports.length)).replace('{ports}', ports.join(', ')) : '');
        });
        const timer = setInterval(() => {
            if (ports.length === 0)
                return;
            void probe(ports).then(rows => {
                const next = {};
                for (const row of rows)
                    next[row.port] = row.alive;
                setAlive(next);
            });
        }, 5000);
        return () => { clearInterval(timer); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);
    // Escape closes the wall; while open the layer captures the key.
    useEffect(() => {
        if (!open)
            return;
        const onKey = (e) => { if (e.key === 'Escape')
            actions.setOpen(false); };
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('keydown', onKey); };
    }, [open, actions]);
    if (!open)
        return null;
    const runDiscovery = async () => {
        setStatus(t('status.scanning').replace('{from}', String(scanFrom)).replace('{to}', String(scanTo)));
        const found = await discover();
        if (found.length === 0) {
            setStatus(t('status.none').replace('{from}', String(scanFrom)).replace('{to}', String(scanTo)));
            return;
        }
        actions.setPorts(found);
        setStatus(t('status.found').replace('{count}', String(found.length)).replace('{ports}', found.join(', ')));
    };
    return (_jsxs("div", { className: css.wall, role: "dialog", "aria-modal": "true", "aria-label": t('overlay.title'), children: [_jsxs("div", { className: css.toolbar, children: [_jsx("span", { className: css.title, children: t('overlay.title') }), _jsx("span", { className: css.status, children: status }), _jsxs("div", { className: css.controls, children: [_jsxs("label", { className: css.field, children: [t('scan.from'), _jsx("input", { type: "number", value: scanFrom, onChange: e => setScanFrom(Number(e.target.value)) })] }), _jsxs("label", { className: css.field, children: [t('scan.to'), _jsx("input", { type: "number", value: scanTo, onChange: e => setScanTo(Number(e.target.value)) })] }), _jsx("button", { type: "button", className: css.btn, onClick: () => { void runDiscovery(); }, children: t('scan') }), _jsx("select", { className: css.field, value: columns, onChange: e => actions.setColumns(e.target.value), children: COLUMN_PRESETS.map(c => (_jsx("option", { value: c, children: c === 'auto' ? t('columns.auto') : c }, c))) }), _jsx("button", { type: "button", className: css.btn, onClick: () => {
                                    document.querySelectorAll(`.${css.paneBody} iframe`).forEach(f => {
                                        f.contentWindow?.location.reload();
                                    });
                                    setStatus(t('status.refreshed'));
                                }, children: t('refresh') }), _jsx("button", { type: "button", className: css.btn, onClick: () => { actions.setOpen(false); }, children: t('overlay.close') })] })] }), _jsxs("div", { className: css.grid, "data-cols": columns, children: [ports.map(port => (_jsx(WallPane, { port: port, alive: aliveRef.current[port] ?? true, zoomed: zoomedPort === port, onZoom: () => setZoomedPort(zoomedPort === port ? null : port), onRemove: () => actions.removePort(port), t: t }, port))), ports.length === 0 && (_jsxs("div", { className: css.empty, children: [_jsx("p", { children: t('empty') }), _jsx("p", { className: css.hint, children: t('empty.hint') })] }))] })] }));
}
//# sourceMappingURL=WallOverlay.js.map