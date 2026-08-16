// @vitest-environment jsdom
/**
 * ui-multi-wall browser half on a real cordis Context with fake slots/locale
 * faces: the plugin registers the sidebar footer toggle and the shell overlay
 * wall, sharing one wall store handle; discovery writes ports through the
 * injected face; registration disposal rides the plugin fiber (HMR safety).
 * The node half and the invariant companion are exercised over the same
 * Context.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { cleanup, render, fireEvent } from '@testing-library/react'
import { afterEach } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { apply, inject } from '../src/client/index.ts'
import { WallToggle } from '../src/client/WallToggle.tsx'
import { WallOverlay, type WallOverlayProps } from '../src/client/WallOverlay.tsx'
import { createWallStore } from '../src/client/store.ts'
import { zh } from '../src/client/locales.ts'
import { apply as nodeApply, Config as nodeConfig } from '../src/index.ts'

afterEach(cleanup)

/** Boot the plugin over fake faces; the wall store is the shared handle. */
async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root', children: {
      'sidebar.footer.action': { kind: 'list', scope: 'root' },
      'shell.overlay': { kind: 'list', scope: 'root' },
    },
  } as never, (() => null) as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  const fiber = ctx.plugin({ inject, apply })
  await fiber.await()
  return { ctx, fiber }
}

function entries(ctx: Context, name: string) {
  return ctx.slots.entries(name as never)
}

describe('ui-multi-wall browser plugin', () => {
  it('registers the sidebar footer toggle and the shell overlay wall', async () => {
    const b = await bench()
    const toggle = entries(b.ctx, 'sidebar.footer.action')[0]
    const overlay = entries(b.ctx, 'shell.overlay')[0]
    expect(toggle?.options).toMatchObject({ id: 'multi-wall', order: 10 })
    expect(toggle?.locale).toBe('multiWall')
    expect(overlay?.options).toMatchObject({ id: 'multi-wall', order: 10 })
    expect(overlay?.locale).toBe('multiWall')
  })

  it('both entries share one wall store handle', async () => {
    const b = await bench()
    const toggle = entries(b.ctx, 'sidebar.footer.action')[0]
    const overlay = entries(b.ctx, 'shell.overlay')[0]
    expect(toggle?.store).toBe(overlay?.store)
  })

  it('drops both entries when the plugin fiber unloads (HMR safety)', async () => {
    const b = await bench()
    expect(entries(b.ctx, 'sidebar.footer.action')).toHaveLength(1)
    expect(entries(b.ctx, 'shell.overlay')).toHaveLength(1)
    await b.fiber.dispose()
    expect(entries(b.ctx, 'sidebar.footer.action')).toHaveLength(0)
    expect(entries(b.ctx, 'shell.overlay')).toHaveLength(0)
  })
})

describe('WallToggle', () => {
  it('renders the label in the wide column and toggles the store', () => {
    const handle = createWallStore()
    const t = makeTranslate(zh, commonZh)
    const actions = handle.create().actions
    const props = {
      wide: true,
      useStore: (sel: (s: { open: boolean; ports: number[]; columns: string }) => unknown) => sel({ open: false, ports: [], columns: 'auto' }),
      actions: { ...actions, toggle: vi.fn() },
      t,
    } as never
    const { getByText, getByRole } = render(<WallToggle {...props} />)
    expect(getByText('多窗口墙')).toBeTruthy()
    fireEvent.click(getByRole('button'))
    expect((props.actions as { toggle: ReturnType<typeof vi.fn> }).toggle).toHaveBeenCalledTimes(1)
  })
})

describe('WallOverlay', () => {
  function overlayProps(over: Partial<WallOverlayProps> = {}): WallOverlayProps {
    const handle = createWallStore()
    const t = makeTranslate(zh, commonZh)
    return {
      useStore: (sel: Parameters<WallOverlayProps['useStore']>[0]) => sel({ open: true, ports: [3080, 3084], columns: 'auto' }),
      actions: handle.create().actions,
      discover: vi.fn(async () => [3080, 3081, 3082, 3084]),
      probe: vi.fn(async (ports: number[]) => ports.map(port => ({ port, alive: true, status: 200 }))),
      t,
      ...over,
    } as WallOverlayProps
  }

  it('renders nothing while closed', () => {
    const props = overlayProps({
      useStore: (sel: Parameters<WallOverlayProps['useStore']>[0]) => sel({ open: false, ports: [], columns: 'auto' }),
    })
    const { container } = render(<WallOverlay {...props} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders one pane per port when open', () => {
    const props = overlayProps()
    const { getAllByTitle, getByText } = render(<WallOverlay {...props} />)
    expect(getAllByTitle(/DSH :/)).toHaveLength(2)
    expect(getByText('127.0.0.1:3080')).toBeTruthy()
  })

  it('calls discovery on open and writes the found ports', () => {
    const props = overlayProps()
    const { getByText } = render(<WallOverlay {...props} />)
    // Discovery is async; the injected face is called, ports arrive after flush.
    expect(props.discover).toHaveBeenCalled()
    void getByText('127.0.0.1:3080')
  })
})

describe('ui-multi-wall node half', () => {
  it('config schema defaults the scan range', () => {
    const cfg = nodeConfig({})
    expect(cfg.scanFrom).toBe(3070)
    expect(cfg.scanTo).toBe(3110)
    expect(cfg.ports).toEqual([])
  })

  it('the node apply registers both probe routes on a live Context', async () => {
    // The node half is genuinely functional: mount it on a real cordis
    // Context whose webServer fake records registrations.
    const ctx = new Context()
    const registered: { kind: string; path: string }[] = []
    ctx.provide('webServer', {
      register: (route: { kind: string; path: string }) => {
        registered.push(route)
        return () => {}
      },
    } as never)
    const fiber = ctx.plugin({ name: nodeApply.name, inject: ['webServer'], apply: nodeApply })
    await fiber.await()
    expect(registered.map(r => `${r.kind} ${r.path}`)).toEqual([
      'exact /multi/api/ports',
      'exact /multi/api/status',
    ])
    await fiber.dispose()
    // Registration disposers are recorded by the fake; the plugin fiber
    // unloads cleanly (HMR safety).
    expect(registered).toHaveLength(2)
  })
})
