/**
 * The node half, exercised over a real cordis Context.
 *
 * This spec runs in the NODE environment on purpose. The node half is Node
 * code, and the browser/jsdom environment silently breaks it: jsdom supplies
 * its own `AbortSignal` class, which Node's `fetch` rejects with
 * "RequestInit: Expected signal to be an instance of AbortSignal", so every
 * probe would fail and the liveness assertions below would be meaningless.
 * The browser half is covered in `browser-plugin.client.spec.tsx`.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { apply as nodeApply, Config as nodeConfig } from '../src/index.ts'

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

  it('discovers a token-guarded instance only when its launch token is known', async () => {
    // Regression for the empty wall on DSH 0.2: every `dsh web` process mints a
    // launch token, answers an unauthenticated `/` with 401, and only then
    // serves the shell. Probing without the token made the wall report every
    // genuinely running instance as dead — the grid stayed empty while the
    // instances were right there.
    const SECRET = 'launch-token-for-test'
    const server = createServer((req, res) => {
      if (new URL(req.url ?? '/', 'http://x').searchParams.get('token') !== SECRET) {
        res.writeHead(401)
        res.end()
        return
      }
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<html><script>window.__DSH_BOOT__={}</script></html>')
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()))
    const port = (server.address() as AddressInfo).port

    const discover = async (tokens: Record<string, string>) => {
      const ctx = new Context()
      const routes = new Map<string, (req: unknown, res: unknown) => void>()
      ctx.provide('webServer', {
        register: (route: { path: string; handler: (req: unknown, res: unknown) => void }) => {
          routes.set(route.path, route.handler)
          return () => {}
        },
      } as never)
      const fiber = ctx.plugin({
        name: nodeApply.name,
        inject: ['webServer'],
        apply: (c: Context) => nodeApply(c, { ...nodeConfig({ tokens }), ports: [port] }),
      })
      await fiber.await()
      let body = ''
      routes.get('/multi/api/ports')?.(
        { url: '/', method: 'GET' },
        { writeHead: () => {}, end: (chunk: string) => { body = chunk } },
      )
      await vi.waitFor(() => { expect(body).not.toBe('') })
      await fiber.dispose()
      return JSON.parse(body).ports as { port: number }[]
    }

    try {
      // No token: the 401 is not a 200 + __DSH_BOOT__, so it stays invisible.
      expect(await discover({})).toEqual([])
      // With the launch token, the same instance is discovered.
      const found = await discover({ [String(port)]: SECRET })
      expect(found.map(row => row.port)).toEqual([port])
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
})