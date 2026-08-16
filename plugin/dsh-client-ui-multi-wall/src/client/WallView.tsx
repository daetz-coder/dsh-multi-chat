/**
 * WallView: the multi-window wall as a `conversation.view` ring entry. When
 * the header's "多窗口墙" tab is selected, the right panel swaps from the
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
import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  IconCloseOutline16, IconFullscreenOutline16, IconGlobeOutline14, IconPlusOutline16,
  IconRefreshOutline14, IconRefreshOutline16, IconRightUpOutline16, IconStopFill16,
  Button, Input, Menu, StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsStore, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { HandleOf } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { createWallStore } from './store.ts'
import type { WallInjected } from './wall-injected.ts'
import css from './WallView.module.css'

/** Composed props: the view-ring runtime share, the store, the probe face, and locale. */
export type WallViewProps =
  & ConvViewProps
  & PropsStore<HandleOf<typeof createWallStore>>
  & WallInjected
  & PropsLocale<'multiWall'>

/** Grid column presets, driven by the toolbar menu. 'auto' fills the row. */
const COLUMN_PRESETS = ['auto', '1', '2', '3', '4', '6'] as const

/** Embed flag appended to every pane URL; such pages register no wall UI. */
const EMBED_FLAG = 'multi-wall=embed'

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
  return (
    <section className={clsx(css.pane, zoomed && css.zoomed)} data-port={port}>
      <div className={css.paneHead}>
        <StateDot state={alive ? 'done' : 'warning'} size={8} className={css.dot} />
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
          <button
            type="button"
            className={clsx(css.action, css.danger, stopping && css.confirm)}
            title={t('stop')}
            onClick={onStop}
          >
            {stopping ? t('stop.confirm') : <IconStopFill16 size={14} />}
          </button>
          <button type="button" className={css.action} title={t('remove')} onClick={onRemove}>
            <IconCloseOutline16 size={14} />
          </button>
        </div>
      </div>
      <div className={css.paneBody}>
        <iframe
          title={`DSH :${port}`}
          src={`http://127.0.0.1:${port}/?${EMBED_FLAG}`}
          loading="lazy"
        />
      </div>
    </section>
  )
}

/**
 * Render the wall: toolbar plus the horizontally-filled pane grid. Discovery
 * runs on mount and liveness polls every 5s; the store's persisted ports
 * survive view switches and reloads.
 * @param props - composed slot props.
 * @returns the wall surface.
 */
export function WallView({ useStore, actions, discover, probe, stop, create, link, t }: WallViewProps) {
  const ports = useStore(s => s.ports)
  const columns = useStore(s => s.columns)
  const [alive, setAlive] = useState<Record<number, boolean>>({})
  const [zoomedPort, setZoomedPort] = useState<number | null>(null)
  const [confirmingStop, setConfirmingStop] = useState<number | null>(null)
  const [scanFrom, setScanFrom] = useState(3070)
  const [scanTo, setScanTo] = useState(3110)
  const [colsMenuOpen, setColsMenuOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkInfo, setLinkInfo] = useState<Awaited<ReturnType<WallViewProps['link']>> | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const [status, setStatus] = useState('')
  const aliveRef = useRef<Record<number, boolean>>({})
  aliveRef.current = alive

  // Discover on mount (the view renders only while selected), then poll
  // liveness while the view stays mounted.
  useEffect(() => {
    void discover().then(found => {
      if (found.length > 0) actions.setPorts(found)
      setStatus(found.length > 0 ? t('status.found').replace('{count}', String(found.length)).replace('{ports}', found.join(', ')) : '')
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
  }, [])

  // Stop is destructive: the first click arms a per-pane confirm, the second
  // executes it. Any other interaction clears the arm. The serving instance
  // itself may be stopped too (the user may want to take this port down).
  const handleStop = async (port: number) => {
    if (confirmingStop !== port) {
      setConfirmingStop(port)
      return
    }
    setConfirmingStop(null)
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

  // Start a brand-new DSH instance and add it to the wall. Failures always
  // surface a concrete reason: the injected face reports HTTP status / body
  // problems, and a thrown fetch surfaces its message — never a silent stall.
  const handleCreate = async () => {
    setCreating(true)
    setStatus('')
    try {
      const result = await create()
      if (result.ok && result.port !== undefined) {
        actions.addPort(result.port)
        setAlive(current => ({ ...current, [result.port!]: true }))
        setStatus(t('create.done').replace('{port}', String(result.port)))
      } else {
        setStatus(t('create.failed').replace('{error}', result.error ?? t('create.unknown')))
      }
    } catch (error) {
      setStatus(t('create.failed').replace('{error}', error instanceof Error ? error.message : String(error)))
    } finally {
      setCreating(false)
    }
  }

  // Leave the wall: switch the view ring back to the default chat view. The
  // ring's active view lives in the chat store and only the header tab's
  // click handler mutates it, so exit reuses that sanctioned path — the chat
  // entry is always the first tab (order 0), which makes the click
  // locale-independent. No tab (blank session) is a no-op.
  const exitWall = () => {
    const tab = document.querySelector<HTMLButtonElement>('[role="tablist"] [role="tab"]')
    tab?.click()
  }

  // Fetch the phone-reachable link(s) for this instance and open the sheet.
  const handleLink = async () => {
    if (linkInfo === null) {
      setStatus(t('link.fetching'))
      const info = await link()
      setLinkInfo(info)
    }
    setLinkOpen(true)
    setLinkCopied(false)
    setStatus('')
  }

  const copyFirstLink = async () => {
    if (linkInfo === null || linkInfo.lan.length === 0) return
    try {
      await navigator.clipboard.writeText(linkInfo.lan[0] ?? '')
      setLinkCopied(true)
    } catch {
      setLinkCopied(false)
    }
  }

  // Every discovered port renders, including the one serving this wall: the
  // user may want to watch (or stop) the instance they are in. Recursion is
  // prevented by the embed flag, not by hiding the self pane.
  const shown = ports

  return (
    <div className={css.wall} role="region" aria-label={t('overlay.title')} data-wall-view="">
      <div className={css.toolbar}>
        <span className={css.title}>{t('overlay.title')}</span>
        <span className={css.status}>{status}</span>
        <div className={css.controls}>
          <label className={css.field}>{t('scan.from')}
            <Input
              type="number"
              value={scanFrom}
              onChange={e => setScanFrom(Number(e.target.value))}
            />
          </label>
          <label className={css.field}>{t('scan.to')}
            <Input
              type="number"
              value={scanTo}
              onChange={e => setScanTo(Number(e.target.value))}
            />
          </label>
          <Button variant="toolbar" size="sm" onClick={() => { void runDiscovery() }}>{t('scan')}</Button>
          <Button
            variant="toolbar"
            size="sm"
            icon={<IconPlusOutline16 size={14} />}
            disabled={creating}
            onClick={() => { void handleCreate() }}
          >
            {t('create')}
          </Button>
          <Menu
            open={colsMenuOpen}
            anchor={
              <Button
                variant="toolbar"
                size="sm"
                icon={<IconRightUpOutline16 size={14} />}
                onClick={() => { setColsMenuOpen(true) }}
              >
                {columns === 'auto' ? t('columns.auto') : columns}
              </Button>
            }
            items={COLUMN_PRESETS.map(c => ({
              id: c,
              label: c === 'auto' ? t('columns.auto') : c,
            }))}
            selectedId={columns}
            onSelect={(id) => {
              actions.setColumns(id)
              setColsMenuOpen(false)
            }}
            onClose={() => { setColsMenuOpen(false) }}
            compact
          />
          <Button
            variant="toolbar"
            size="sm"
            icon={<IconRefreshOutline14 size={14} />}
            onClick={() => {
              document.querySelectorAll(`.${css.paneBody} iframe`).forEach(f => {
                (f as HTMLIFrameElement).contentWindow?.location.reload()
              })
              setStatus(t('status.refreshed'))
            }}
          >
            {t('refresh')}
          </Button>
          <Button
            variant="toolbar"
            size="sm"
            icon={<IconGlobeOutline14 size={14} />}
            aria-label={t('link.aria')}
            onClick={() => { void handleLink() }}
          >
            {t('link')}
          </Button>
          <Button
            variant="toolbar"
            size="sm"
            icon={<IconCloseOutline16 size={14} />}
            aria-label={t('exit.aria')}
            title={t('exit')}
            onClick={() => { exitWall() }}
          >
            {t('exit')}
          </Button>
        </div>
      </div>
      {linkOpen && linkInfo !== null && (
        <div className={css.linkBar}>
          {linkInfo.reachable
            ? (
              <>
                <span className={css.linkText}>
                  {t('link.reachable').replace('{urls}', linkInfo.lan.join('  '))}
                </span>
                {linkInfo.lan.length > 0 && (
                  <Button variant="outline" size="sm" onClick={() => { void copyFirstLink() }}>
                    {linkCopied ? t('link.copied') : t('link.copy')}
                  </Button>
                )}
              </>
            )
            : (
              <span className={css.linkText}>
                {t('link.unreachable').replace('{hint}', linkInfo.hint ?? '')}
              </span>
            )}
          <Button variant="ghost" size="sm" icon={<IconCloseOutline16 size={14} />} onClick={() => { setLinkOpen(false) }}>
            {t('overlay.close')}
          </Button>
        </div>
      )}
      <div className={css.grid} data-cols={columns}>
        {shown.map(port => (
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
        {shown.length === 0 && (
          <div className={css.empty}>
            <p>{t('empty')}</p>
            <p className={css.hint}>{t('empty.hint')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
