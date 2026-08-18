import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * WallView: the multi-window wall as a `conversation.view` ring entry. When
 * the header's "多窗口" tab is selected, the right panel swaps from the
 * chat to this view — a toolbar plus a grid of iframes, one pane per running
 * DSH instance (127.0.0.1:<port>). Pure additive UI; no existing slot is
 * replaced.
 *
 * Recursion guard: panes embed `?multi-wall=embed` (the embedded page
 * registers no wall UI). The serving instance is itself a pane, so the user
 * can watch — or stop — the very instance they are in.
 *
 * Live data channels: the store owns ports/columns; discovery writes
 * `setPorts` from /multi/api/ports (same-origin, served by the node half);
 * per-pane liveness arrives from /multi/api/status polls. Components never
 * see ctx — the fetch helpers are injected through the registration.
 */
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { IconCloseOutline16, IconFullscreenOutline16, IconGlobeOutline14, IconPlusOutline16, IconRefreshOutline14, IconRefreshOutline16, IconRightUpOutline16, IconStopFill16, Button, Input, Menu, StateDot, } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './WallView.module.css';
/** Grid column presets, driven by the toolbar menu. 'auto' fills the row. */
const COLUMN_PRESETS = ['auto', '1', '2', '3', '4', '6'];
/** Embed flag appended to every pane URL; such pages register no wall UI. */
const EMBED_FLAG = 'multi-wall=embed';
/**
 * Whether this wall is being viewed through the phone gateway (a non-loopback
 * host) rather than on the machine running DSH. When remote, pane iframes must
 * load through the gateway's `/gw/<port>` route — a phone's `127.0.0.1` points
 * at the phone itself, not the host.
 */
function isRemoteViewer() {
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    return host !== 'localhost' && host !== '127.0.0.1' && host !== '::1';
}
/**
 * The iframe URL for a pane. Local viewers embed the loopback instance
 * directly; remote (phone) viewers route through the gateway that is already
 * serving this page, appending the port so the gateway proxies to it.
 * @param port - target DSH instance port.
 * @returns the pane URL.
 */
function paneUrl(port) {
    if (isRemoteViewer()) {
        return `${window.location.origin}/gw/${port}/?${EMBED_FLAG}`;
    }
    return `http://127.0.0.1:${port}/?${EMBED_FLAG}`;
}
/**
 * One pane: header (port, liveness dot, zoom/refresh/open/stop/remove) plus
 * the embedded original DSH UI.
 */
function WallPane(props) {
    const { port, alive, zoomed, stopping, onZoom, onStop, onRemove, t } = props;
    return (_jsxs("section", { className: clsx(css.pane, zoomed && css.zoomed), "data-port": port, children: [_jsxs("div", { className: css.paneHead, children: [_jsx(StateDot, { state: alive ? 'done' : 'warning', size: 8, className: css.dot }), _jsxs("span", { className: css.paneTitle, children: ["127.0.0.1:", port] }), _jsxs("div", { className: css.paneActions, children: [_jsx("button", { type: "button", className: css.action, title: t('zoom'), onClick: onZoom, children: _jsx(IconFullscreenOutline16, { size: 14 }) }), _jsx("button", { type: "button", className: css.action, title: t('reload'), onClick: (e) => {
                                    e.currentTarget.closest('section')?.querySelector('iframe')?.contentWindow?.location.reload();
                                }, children: _jsx(IconRefreshOutline16, { size: 14 }) }), _jsx("button", { type: "button", className: css.action, title: t('openTab'), onClick: () => {
                                    window.open(paneUrl(port), '_blank');
                                }, children: _jsx(IconRightUpOutline16, { size: 14 }) }), _jsx("button", { type: "button", className: clsx(css.action, css.danger, stopping && css.confirm), title: t('stop'), onClick: onStop, children: stopping ? t('stop.confirm') : _jsx(IconStopFill16, { size: 14 }) }), _jsx("button", { type: "button", className: css.action, title: t('remove'), onClick: onRemove, children: _jsx(IconCloseOutline16, { size: 14 }) })] })] }), _jsx("div", { className: css.paneBody, children: _jsx("iframe", { title: `DSH :${port}`, src: paneUrl(port), loading: "lazy" }) })] }));
}
/**
 * Render the wall: toolbar plus the horizontally-filled pane grid. Discovery
 * runs on mount and liveness polls every 5s; the store's persisted ports
 * survive view switches and reloads.
 * @param props - composed slot props.
 * @returns the wall surface.
 */
export function WallView({ useStore, actions, discover, probe, stop, create, link, t }) {
    const ports = useStore(s => s.ports);
    const columns = useStore(s => s.columns);
    const [alive, setAlive] = useState({});
    const [zoomedPort, setZoomedPort] = useState(null);
    const [confirmingStop, setConfirmingStop] = useState(null);
    const [scanFrom, setScanFrom] = useState(3070);
    const [scanTo, setScanTo] = useState(3110);
    const [colsMenuOpen, setColsMenuOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [linkOpen, setLinkOpen] = useState(false);
    const [linkInfo, setLinkInfo] = useState(null);
    const [linkCopied, setLinkCopied] = useState(false);
    const [status, setStatus] = useState('');
    const aliveRef = useRef({});
    aliveRef.current = alive;
    // Discover on mount (the view renders only while selected), then poll
    // liveness while the view stays mounted.
    useEffect(() => {
        void discover().then(found => {
            if (found.length > 0)
                actions.setPorts(found);
            setStatus(found.length > 0 ? t('status.found').replace('{count}', String(found.length)).replace('{ports}', found.join(', ')) : '');
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
    }, []);
    // Stop is destructive: the first click arms a per-pane confirm, the second
    // executes it. Any other interaction clears the arm. The serving instance
    // itself may be stopped too (the user may want to take this port down).
    const handleStop = async (port) => {
        if (confirmingStop !== port) {
            setConfirmingStop(port);
            return;
        }
        setConfirmingStop(null);
        const result = await stop(port);
        if (result.ok) {
            actions.removePort(port);
            setAlive(current => ({ ...current, [port]: false }));
            setStatus(t('stop.done').replace('{port}', String(port)));
        }
        else {
            setStatus(t('stop.failed').replace('{port}', String(port)).replace('{error}', result.error ?? ''));
        }
    };
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
    // Start a brand-new DSH instance and add it to the wall. Failures always
    // surface a concrete reason: the injected face reports HTTP status / body
    // problems, and a thrown fetch surfaces its message — never a silent stall.
    const handleCreate = async () => {
        setCreating(true);
        setStatus('');
        try {
            const result = await create();
            if (result.ok && result.port !== undefined) {
                actions.addPort(result.port);
                setAlive(current => ({ ...current, [result.port]: true }));
                setStatus(t('create.done').replace('{port}', String(result.port)));
            }
            else {
                setStatus(t('create.failed').replace('{error}', result.error ?? t('create.unknown')));
            }
        }
        catch (error) {
            setStatus(t('create.failed').replace('{error}', error instanceof Error ? error.message : String(error)));
        }
        finally {
            setCreating(false);
        }
    };
    // Leave the wall: switch the view ring back to the default chat view. The
    // ring's active view lives in the chat store and only the header tab's
    // click handler mutates it, so exit reuses that sanctioned path — the chat
    // entry is always the first tab (order 0), which makes the click
    // locale-independent. No tab (blank session) is a no-op.
    const exitWall = () => {
        const tab = document.querySelector('[role="tablist"] [role="tab"]');
        tab?.click();
    };
    // Fetch the phone-reachable link(s) for this instance and open the sheet.
    const handleLink = async () => {
        if (linkInfo === null) {
            setStatus(t('link.fetching'));
            const info = await link();
            setLinkInfo(info);
        }
        setLinkOpen(true);
        setLinkCopied(false);
        setStatus('');
    };
    // Copy the first phone-reachable link to the clipboard. When the gateway
    // issued a token it is appended as `?token=` so the phone bypasses the login
    // form entirely (the gateway accepts a matching `?token=` query); the URL is
    // otherwise the bare link. The standalone token line is still shown above so
    // users who prefer typing it can.
    const copyFirstLink = async () => {
        if (linkInfo === null || linkInfo.lan.length === 0)
            return;
        try {
            const base = linkInfo.lan[0] ?? '';
            const token = linkInfo.token ?? '';
            const url = token !== '' ? `${base}?token=${encodeURIComponent(token)}` : base;
            await navigator.clipboard.writeText(url);
            setLinkCopied(true);
        }
        catch {
            setLinkCopied(false);
        }
    };
    // Every discovered port renders, including the one serving this wall: the
    // user may want to watch (or stop) the instance they are in. Recursion is
    // prevented by the embed flag, not by hiding the self pane.
    const shown = ports;
    return (_jsxs("div", { className: css.wall, role: "region", "aria-label": t('overlay.title'), "data-wall-view": "", children: [_jsxs("div", { className: css.toolbar, children: [_jsx("span", { className: css.title, children: t('overlay.title') }), _jsx("span", { className: css.status, children: status }), _jsxs("div", { className: css.controls, children: [_jsxs("label", { className: css.field, children: [t('scan.from'), _jsx(Input, { type: "number", value: scanFrom, onChange: e => setScanFrom(Number(e.target.value)) })] }), _jsxs("label", { className: css.field, children: [t('scan.to'), _jsx(Input, { type: "number", value: scanTo, onChange: e => setScanTo(Number(e.target.value)) })] }), _jsx(Button, { variant: "toolbar", size: "sm", onClick: () => { void runDiscovery(); }, children: t('scan') }), _jsx(Button, { variant: "toolbar", size: "sm", icon: _jsx(IconPlusOutline16, { size: 14 }), disabled: creating, onClick: () => { void handleCreate(); }, children: creating ? t('create.pending') : t('create') }), _jsx(Menu, { open: colsMenuOpen, anchor: _jsx(Button, { variant: "toolbar", size: "sm", icon: _jsx(IconRightUpOutline16, { size: 14 }), onClick: () => { setColsMenuOpen(true); }, children: columns === 'auto' ? t('columns.auto') : columns }), items: COLUMN_PRESETS.map(c => ({
                                    id: c,
                                    label: c === 'auto' ? t('columns.auto') : c,
                                })), selectedId: columns, onSelect: (id) => {
                                    actions.setColumns(id);
                                    setColsMenuOpen(false);
                                }, onClose: () => { setColsMenuOpen(false); }, compact: true }), _jsx(Button, { variant: "toolbar", size: "sm", icon: _jsx(IconRefreshOutline14, { size: 14 }), onClick: () => {
                                    document.querySelectorAll(`.${css.paneBody} iframe`).forEach(f => {
                                        f.contentWindow?.location.reload();
                                    });
                                    setStatus(t('status.refreshed'));
                                }, children: t('refresh') }), _jsx(Button, { variant: "toolbar", size: "sm", icon: _jsx(IconGlobeOutline14, { size: 14 }), "aria-label": t('link.aria'), onClick: () => { void handleLink(); }, children: t('link') }), _jsx(Button, { variant: "toolbar", size: "sm", icon: _jsx(IconCloseOutline16, { size: 14 }), "aria-label": t('exit.aria'), title: t('exit'), onClick: () => { exitWall(); }, children: t('exit') })] })] }), linkOpen && linkInfo !== null && (_jsxs("div", { className: css.linkBar, children: [linkInfo.reachable
                        ? (_jsxs(_Fragment, { children: [_jsxs("span", { className: css.linkText, children: [t('link.reachable').replace('{urls}', linkInfo.lan.join('  ')), linkInfo.token !== undefined && linkInfo.token !== ''
                                            ? `  ${t('link.token').replace('{token}', linkInfo.token)}`
                                            : ''] }), linkInfo.lan.length > 0 && (_jsx(Button, { variant: "outline", size: "sm", onClick: () => { void copyFirstLink(); }, children: linkCopied ? t('link.copied') : t('link.copy') }))] }))
                        : (_jsx("span", { className: css.linkText, children: t('link.unreachable').replace('{hint}', linkInfo.hint ?? '') })), _jsx(Button, { variant: "ghost", size: "sm", icon: _jsx(IconCloseOutline16, { size: 14 }), onClick: () => { setLinkOpen(false); }, children: t('overlay.close') })] })), _jsxs("div", { className: css.grid, "data-cols": columns, children: [shown.map(port => (_jsx(WallPane, { port: port, alive: aliveRef.current[port] ?? true, zoomed: zoomedPort === port, stopping: confirmingStop === port, onZoom: () => setZoomedPort(zoomedPort === port ? null : port), onStop: () => { void handleStop(port); }, onRemove: () => { setConfirmingStop(null); actions.removePort(port); }, t: t }, port))), shown.length === 0 && (_jsxs("div", { className: css.empty, children: [_jsx("p", { children: t('empty') }), _jsx("p", { className: css.hint, children: t('empty.hint') })] }))] })] }));
}
//# sourceMappingURL=WallView.js.map