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
import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  IconCloseOutline16, IconFullscreenOutline16, IconRefreshOutline16, IconRightUpOutline16,
  IconStopFill16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { HandleOf } from '@deepseek-ai/dsh-client-ui-slots'
import type { createWallStore } from './store.ts'
import type { WallInjected } from './wall-injected.ts'
import css from './WallOverlay.module.css'

/** Composed props: the store share, the injected probe face, and locale. */
export type WallOverlayProps =
  & PropsRuntime<'shell.overlay'>
  & PropsStore<HandleOf<typeof createWallStore>>
  & WallInjected
  & PropsLocale<'multiWall'>

/** Grid column presets, driven by the toolbar select. */
const COLUMN_PRESETS = ['auto', '1', '2', '3', '4', '6'] as const

/** The port this very page is served on (the wall's own instance). */
const SELF_PORT = Number(window.location.port) || 3084

/**
 * One pane: header (port, liveness dot, zoom/refresh/open/stop/remove) plus
 * the embedded original DSH UI.
 */
function WallPane(props: {
  port: number
  alive: boolean
  zoomed: boolean
  stopping: boolean
  onZoom: () => void
  onStop: () => void
  onRemove: () => void
  t: TranslateNS<'multiWall'>
}) {
  const { port, alive, zoomed, stopping, onZoom, onStop, onRemove, t } = props
  const self = port === SELF_PORT
  return (
    <section className={clsx(css.pane, zoomed && css.zoomed)} data-port={port}>
      <div className={css.paneHead}>
        <span className={clsx(css.dot, alive ? css.ok : css.bad)} aria-hidden="true" />
        <span className={css.paneTitle}>127.0.0.1:{port}</span>
        <div className={css.paneActions}>
          <button type="button" className={css.action} title={t('zoom')} onClick={onZoom}>
            <IconFullscreenOutline16 size={14} />
          </button>
          <button type="button" className={css.action} title={t('reload')} onClick={(e) => {
            e.currentTarget.closest('section')?.querySelector('iframe')?.contentWindow?.location.reload()
          }}>
            <IconRefreshOutline16 size={14} />
          </button>
          <button type="button" className={css.action} title={t('openTab')} onClick={() => {
            window.open(`http://127.0.0.1:${port}/`, '_blank')
          }}>
            <IconRightUpOutline16 size={14} />
          </button>
          {!self && (
            <button
              type="button"
              className={clsx(css.action, css.danger, stopping && css.confirm)}
              title={self ? t('stop.self') : t('stop')}
              onClick={onStop}
            >
              {stopping ? t('stop.confirm') : <IconStopFill16 size={14} />}
            </button>
          )}
          <button type="button" className={css.action} title={t('remove')} onClick={onRemove}>
            <IconCloseOutline16 size={14} />
          </button>
        </div>
      </div>
      <div className={css.paneBody}>
        <iframe
          title={`DSH :${port}`}
          src={`http://127.0.0.1:${port}/`}
          loading="lazy"
        />
      </div>
    </section>
  )
}

/**
 * Render the wall when open, nothing otherwise. Discovery runs on open;
 * liveness polls every 5s while open.
 * @param props - composed slot props.
 * @returns the wall surface or null.
 */
export function WallOverlay({ useStore, actions, discover, probe, stop, t }: WallOverlayProps) {
  const open = useStore(s => s.open)
  const ports = useStore(s => s.ports)
  const columns = useStore(s => s.columns)
  const [alive, setAlive] = useState<Record<number, boolean>>({})
  const [zoomedPort, setZoomedPort] = useState<number | null>(null)
  const [confirmingStop, setConfirmingStop] = useState<number | null>(null)
  const [scanFrom, setScanFrom] = useState(3070)
  const [scanTo, setScanTo] = useState(3110)
  const [status, setStatus] = useState('')
  const aliveRef = useRef<Record<number, boolean>>({})
  aliveRef.current = alive

  // Discover on first open, then poll liveness while open.
  useEffect(() => {
    if (!open) return
    void discover().then(ports => {
      if (ports.length > 0) actions.setPorts(ports)
      setStatus(ports.length > 0 ? t('status.found').replace('{count}', String(ports.length)).replace('{ports}', ports.join(', ')) : '')
    })
    const timer = setInterval(() => {
      if (ports.length === 0) return
      void probe(ports).then(rows => {
        const next: Record<number, boolean> = {}
        for (const row of rows) next[row.port] = row.alive
        setAlive(next)
      })
    }, 5000)
    return () => { clearInterval(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Escape closes the wall; while open the layer captures the key.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') actions.setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey) }
  }, [open, actions])

  if (!open) return null

  // Stop is destructive: the first click arms a per-pane confirm, the second
  // executes it. Any other interaction clears the arm.
  const handleStop = async (port: number) => {
    if (confirmingStop !== port) {
      setConfirmingStop(port)
      return
    }
    setConfirmingStop(null)
    if (port === SELF_PORT) {
      setStatus(t('stop.self'))
      return
    }
    const result = await stop(port)
    if (result.ok) {
      actions.removePort(port)
      setAlive(current => ({ ...current, [port]: false }))
      setStatus(t('stop.done').replace('{port}', String(port)))
    } else {
      setStatus(t('stop.failed').replace('{port}', String(port)).replace('{error}', result.error ?? ''))
    }
  }

  const runDiscovery = async () => {
    setStatus(t('status.scanning').replace('{from}', String(scanFrom)).replace('{to}', String(scanTo)))
    const found = await discover()
    if (found.length === 0) {
      setStatus(t('status.none').replace('{from}', String(scanFrom)).replace('{to}', String(scanTo)))
      return
    }
    actions.setPorts(found)
    setStatus(t('status.found').replace('{count}', String(found.length)).replace('{ports}', found.join(', ')))
  }

  return (
    <div className={css.wall} role="dialog" aria-modal="true" aria-label={t('overlay.title')}>
      <div className={css.toolbar}>
        <span className={css.title}>{t('overlay.title')}</span>
        <span className={css.status}>{status}</span>
        <div className={css.controls}>
          <label className={css.field}>{t('scan.from')}
            <input type="number" value={scanFrom} onChange={e => setScanFrom(Number(e.target.value))} />
          </label>
          <label className={css.field}>{t('scan.to')}
            <input type="number" value={scanTo} onChange={e => setScanTo(Number(e.target.value))} />
          </label>
          <button type="button" className={css.btn} onClick={() => { void runDiscovery() }}>{t('scan')}</button>
          <select className={css.field} value={columns} onChange={e => actions.setColumns(e.target.value)}>
            {COLUMN_PRESETS.map(c => (
              <option key={c} value={c}>{c === 'auto' ? t('columns.auto') : c}</option>
            ))}
          </select>
          <button type="button" className={css.btn} onClick={() => {
            document.querySelectorAll(`.${css.paneBody} iframe`).forEach(f => {
              (f as HTMLIFrameElement).contentWindow?.location.reload()
            })
            setStatus(t('status.refreshed'))
          }}>{t('refresh')}</button>
          <button type="button" className={css.btn} onClick={() => { actions.setOpen(false) }}>{t('overlay.close')}</button>
        </div>
      </div>
      <div className={css.grid} data-cols={columns}>
        {ports.map(port => (
          <WallPane
            key={port}
            port={port}
            alive={aliveRef.current[port] ?? true}
            zoomed={zoomedPort === port}
            stopping={confirmingStop === port}
            onZoom={() => setZoomedPort(zoomedPort === port ? null : port)}
            onStop={() => { void handleStop(port) }}
            onRemove={() => { setConfirmingStop(null); actions.removePort(port) }}
            t={t}
          />
        ))}
        {ports.length === 0 && (
          <div className={css.empty}>
            <p>{t('empty')}</p>
            <p className={css.hint}>{t('empty.hint')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
