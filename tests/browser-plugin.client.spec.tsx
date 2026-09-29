// @vitest-environment jsdom
// @vitest-environment-options {"url": "http://localhost:3084/"}
/**
 * ui-multi-wall browser half on a real cordis Context with fake slots/locale
 * faces: the plugin registers the view-ring entry (the wall) and the sidebar
 * footer shortcut, sharing one wall store handle; discovery writes ports
 * through the injected face; registration disposal rides the plugin fiber
 * (HMR safety). The node half and the invariant companion are exercised over
 * the same Context.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { connect } from 'node:net'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { cleanup, render, fireEvent, waitFor } from '@testing-library/react'
import { afterEach } from 'vitest'
// Type-only: the value comes from the module-table stand-in below, because a
// client bundle has no ESM exports (see tests/dsh-module-loader.ts).
import type { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { loadBundle } from './dsh-module-loader.ts'
import { apply, inject } from '../src/client/index.ts'
import { WallToggle } from '../src/client/WallToggle.tsx'
import { WallView, type WallViewProps } from '../src/client/WallView.tsx'
import { createWallStore } from '../src/client/store.ts'
import { zh } from '../src/client/locales.ts'
import { apply as nodeApply, Config as nodeConfig } from '../src/index.ts'

afterEach(cleanup)

/**
 * Start a throwaway TCP listener in a CHILD process and resolve with its port.
 * A child keeps `stopPort` from terminating the test runner, and an ephemeral
 * port keeps the spec from colliding with anything else on the box.
 * @returns the child and the port it is listening on.
 */
function startListener(): Promise<{ child: ChildProcess; port: number }> {
  const child = spawn(
    process.execPath,
    ['-e', "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>console.log(s.address().port))"],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  )
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { reject(new Error('listener never reported a port')) }, 10_000)
    let buffered = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      buffered += String(chunk)
      const line = buffered.split('\n')[0]?.trim() ?? ''
      if (line !== '') {
        clearTimeout(timer)
        resolve({ child, port: Number(line) })
      }
    })
    child.once('error', reject)
  })
}

/** Wait for a child to be reaped by the signal `stopPort` sends it. */
async function waitForExit(child: ChildProcess): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (child.exitCode !== null || child.signalCode !== null) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

/**
 * Build a translate stub resolving through `dicts` in order, falling back to
 * the key itself, with `{name}` interpolation.
 *
 * Inlined rather than imported: the upstream helper lives in
 * `@deepseek-ai/dsh-client-test-runtime`, whose published bundle imports
 * `@deepseek-ai/dsh-client-ui-renderer/src/client/bind.ts` — a path the
 * published tarballs do not ship, so that package cannot load outside the
 * harness monorepo. This mirrors its implementation exactly.
 * @param dicts - dictionaries consulted in order.
 * @returns the translate function (assignable to any `XxxProps['t']` seat).
 */
function makeTranslate(...dicts: readonly Record<string, string>[]) {
  return (key: string, params?: Record<string, unknown>): string => {
    let template = key
    for (const dict of dicts) {
      const hit = dict[key]
      if (hit !== undefined) { template = hit; break }
    }
    if (!params) return template
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match)
  }
}

/** Boot the plugin over fake faces; the wall store is the shared handle. */
async function bench() {
  const { SlotRegistry } = await loadBundle<{ SlotRegistry: Parameters<Context['plugin']>[0] }>(
    '@deepseek-ai/dsh-client-ui-renderer/client',
  )
  const { LocaleRuntime: Locale } = await loadBundle<{ LocaleRuntime: typeof LocaleRuntime }>(
    '@deepseek-ai/dsh-client-locale/client',
  )
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root', children: {
      'sidebar.footer.action': { kind: 'list', scope: 'root' },
      'conversation.view': { kind: 'list', scope: 'session' },
    },
  } as never, (() => null) as never)
  ctx.provide('locale', new Locale(ctx))
  const fiber = ctx.plugin({ inject, apply })
  await fiber.await()
  return { ctx, fiber }
}

function entries(ctx: Context, name: string) {
  return ctx.slots.entries(name as never)
}

describe('ui-multi-wall browser plugin', () => {
  it('registers the view-ring wall entry and the sidebar footer shortcut', async () => {
    const b = await bench()
    const toggle = entries(b.ctx, 'sidebar.footer.action')[0]
    const view = entries(b.ctx, 'conversation.view')[0]
    expect(toggle?.options).toMatchObject({ id: 'multi-wall', order: 10 })
    expect(toggle?.locale).toBe('multiWall')
    expect(view?.options).toMatchObject({ id: 'multi-wall', order: 20 })
    expect(view?.locale).toBe('multiWall')
  })

  it('the view entry carries the wall store and the probe inject', async () => {
    const b = await bench()
    const view = entries(b.ctx, 'conversation.view')[0]
    expect(view?.store).toBeDefined()
    expect(view?.inject).toBeDefined()
  })

  it('registers nothing on an embedded pane (recursion guard)', async () => {
    // jsdom URL mutation; the plugin must skip every registration.
    const original = window.location.href
    history.replaceState(null, '', '/?multi-wall=embed')
    try {
      const b = await bench()
      expect(entries(b.ctx, 'sidebar.footer.action')).toHaveLength(0)
      expect(entries(b.ctx, 'conversation.view')).toHaveLength(0)
    } finally {
      history.replaceState(null, '', original)
    }
  })

  it('drops both entries when the plugin fiber unloads (HMR safety)', async () => {
    const b = await bench()
    expect(entries(b.ctx, 'sidebar.footer.action')).toHaveLength(1)
    expect(entries(b.ctx, 'conversation.view')).toHaveLength(1)
    await b.fiber.dispose()
    expect(entries(b.ctx, 'sidebar.footer.action')).toHaveLength(0)
    expect(entries(b.ctx, 'conversation.view')).toHaveLength(0)
  })
})

describe('WallToggle', () => {
  it('renders the label in the wide column and clicks the matching view tab', () => {
    // A fake header tab for the wall label; the shortcut must click it.
    const tab = document.createElement('button')
    tab.setAttribute('role', 'tab')
    tab.textContent = zh['view.multiWall']
    const click = vi.spyOn(tab, 'click')
    document.body.appendChild(tab)
    try {
      const t = makeTranslate(zh)
      const props = {
        wide: true,
        t,
      } as never
      const { getByRole } = render(<WallToggle {...props} />)
      const button = getByRole('button') as HTMLButtonElement
      expect(button.textContent).toContain('多窗口')
      fireEvent.click(button)
      expect(click).toHaveBeenCalledTimes(1)
    } finally {
      document.body.removeChild(tab)
    }
  })

  it('is a no-op when no view tab exists (no active session)', () => {
    const t = makeTranslate(zh)
    const props = { wide: true, t } as never
    const { getByRole } = render(<WallToggle {...props} />)
    expect(() => fireEvent.click(getByRole('button'))).not.toThrow()
  })
})

describe('WallView', () => {
  function viewProps(over: Partial<WallViewProps> = {}): WallViewProps {
    const handle = createWallStore()
    const t = makeTranslate(zh)
    return {
      useStore: (sel: Parameters<WallViewProps['useStore']>[0]) => sel({ ports: [3080, 3084], columns: 'auto' }),
      actions: handle.create().actions,
      discover: vi.fn(async () => [3080, 3081, 3082, 3084]),
      probe: vi.fn(async (ports: number[]) => ports.map(port => ({ port, alive: true, status: 200 }))),
      stop: vi.fn(async () => ({ port: 3080, ok: true })),
      create: vi.fn(async () => ({ ok: true, port: 3090 })),
      link: vi.fn(async () => ({ port: 3084, host: '0.0.0.0', lan: ['http://192.168.1.5:3084/'], reachable: true })),
      t,
      ...over,
    } as WallViewProps
  }

  it('renders one pane per port, including the serving port', () => {
    // SELF_PORT is 3084 (jsdom default port); the wall shows it too so the
    // user can watch or stop the instance they are in.
    const props = viewProps()
    const { getAllByTitle, getByText } = render(<WallView {...props} />)
    expect(getAllByTitle(/DSH :/)).toHaveLength(2)
    expect(getByText('127.0.0.1:3080')).toBeTruthy()
    expect(getByText('127.0.0.1:3084')).toBeTruthy()
  })

  it('embeds panes with the recursion-guard query flag', () => {
    const props = viewProps()
    const { container } = render(<WallView {...props} />)
    const iframe = container.querySelector('iframe')
    expect(iframe?.getAttribute('src')).toContain('multi-wall=embed')
  })

  it('calls discovery on mount and writes the found ports', () => {
    const props = viewProps()
    render(<WallView {...props} />)
    // Discovery is async; the injected face is called, ports arrive after flush.
    expect(props.discover).toHaveBeenCalled()
  })

  it('stop requires two clicks and then removes the pane', async () => {
    const stop = vi.fn(async () => ({ port: 3080, ok: true }))
    const props = viewProps({ stop })
    const { getAllByTitle } = render(<WallView {...props} />)
    const stopButton = getAllByTitle('关闭实例')[0]
    expect(stopButton).toBeTruthy()
    // First click arms the confirm (label swaps), stop not yet called.
    fireEvent.click(stopButton)
    expect(stop).not.toHaveBeenCalled()
    // Second click executes.
    fireEvent.click(stopButton)
    await waitFor(() => expect(stop).toHaveBeenCalledWith(3080))
  })

  it('stop failure surfaces the error and keeps the pane', async () => {
    const stop = vi.fn(async () => ({ port: 3080, ok: false, error: 'no listener on this port' }))
    const props = viewProps({ stop })
    const { getAllByTitle, getByText } = render(<WallView {...props} />)
    const stopButton = getAllByTitle('关闭实例')[0]
    fireEvent.click(stopButton)
    fireEvent.click(stopButton)
    await waitFor(() => expect(getByText(/关闭 :3080 失败/)).toBeTruthy())
  })

  it('creates a new window on the toolbar action and adds it to the wall', async () => {
    const props = viewProps()
    const { getByText } = render(<WallView {...props} />)
    fireEvent.click(getByText('新建窗口'))
    await waitFor(() => expect(props.create).toHaveBeenCalled())
    await waitFor(() => expect(getByText(/已创建窗口 :3090/)).toBeTruthy())
  })

  it('create failure surfaces the thrown reason instead of a silent stall', async () => {
    const create = vi.fn(async () => { throw new Error('ENOENT spawn failed') })
    const props = viewProps({ create })
    const { getByText } = render(<WallView {...props} />)
    fireEvent.click(getByText('新建窗口'))
    await waitFor(() => expect(getByText(/ENOENT spawn failed/)).toBeTruthy())
  })

  it('create ok:false without a reason shows the generic unknown copy', async () => {
    const create = vi.fn(async () => ({ ok: false }))
    const props = viewProps({ create })
    const { getByText } = render(<WallView {...props} />)
    fireEvent.click(getByText('新建窗口'))
    await waitFor(() => expect(getByText('创建失败：未知原因')).toBeTruthy())
  })

  it('the exit button returns to the chat view by activating the first tab', () => {
    // The wall is a view-ring entry; the chat entry is always the first tab
    // (order 0), so the X button must click it to leave the wall.
    const chatTab = document.createElement('button')
    chatTab.setAttribute('role', 'tab')
    chatTab.textContent = '对话'
    const wallTab = document.createElement('button')
    wallTab.setAttribute('role', 'tab')
    wallTab.textContent = '多窗口墙'
    const tablist = document.createElement('div')
    tablist.setAttribute('role', 'tablist')
    tablist.append(chatTab, wallTab)
    const click = vi.spyOn(chatTab, 'click')
    document.body.appendChild(tablist)
    try {
      const props = viewProps()
      const { getByTitle } = render(<WallView {...props} />)
      fireEvent.click(getByTitle('退出'))
      expect(click).toHaveBeenCalledTimes(1)
    } finally {
      document.body.removeChild(tablist)
    }
  })

  it('the exit button is a no-op when no tablist is present (blank session)', () => {
    const props = viewProps()
    const { getByTitle } = render(<WallView {...props} />)
    expect(() => fireEvent.click(getByTitle('退出'))).not.toThrow()
  })

  it('shows the phone link bar with LAN urls when reachable', async () => {
    const props = viewProps()
    const { getByText } = render(<WallView {...props} />)
    fireEvent.click(getByText('手机访问'))
    await waitFor(() => expect(getByText(/192\.168\.1\.5:3084/)).toBeTruthy())
  })
})

describe('ui-multi-wall node half', () => {
  it('config schema defaults the scan range', () => {
    const cfg = nodeConfig({})
    expect(cfg.scanFrom).toBe(3070)
    expect(cfg.scanTo).toBe(3110)
    expect(cfg.ports).toEqual([])
    expect(cfg.publicUrl).toBe('')
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
      'exact /multi/api/stop',
      'exact /multi/api/create',
      'exact /multi/api/link',
    ])
    await fiber.dispose()
    // Registration disposers are recorded by the fake; the plugin fiber
    // unloads cleanly (HMR safety).
    expect(registered).toHaveLength(5)
  })

  it('finds and stops a real listener on a host without lsof', async () => {
    // Exercises whichever backend is available: `lsof` where it exists, and
    // the /proc/net/tcp* + /proc/<pid>/fd fallback where it does not — which
    // is most container images, including the ones `dsh web` usually runs in.
    const { stopPort } = await import('../src/index.ts')
    const { child, port } = await startListener()
    try {
      expect(await stopPort(port, 0)).toEqual({ port, ok: true })
      await waitForExit(child)
      expect(child.signalCode ?? child.exitCode).not.toBeNull()
    } finally {
      child.kill('SIGKILL')
    }
  })

  it('stopPort no longer refuses the self port (may stop the serving instance)', async () => {
    const { stopPort } = await import('../src/index.ts')
    // 3199 has no listener, so the result is a listener error — NOT the old
    // "serving this wall" refusal. The self-port path must reach the listener
    // lookup instead of short-circuiting.
    const result = await stopPort(3199, 3199)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('no listener')
    expect(result.error).not.toContain('serving this wall')
  })
})
