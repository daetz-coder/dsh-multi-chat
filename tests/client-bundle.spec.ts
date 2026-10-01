// @vitest-environment jsdom
/**
 * The SHIPPED browser half, loaded the way the web shell loads it.
 *
 * This is the regression test for v1.0.3: the bundle required
 * `@deepseek-ai/dsh-client-runtime/client`, a package upstream had deleted, so
 * materializing it threw "missed the module table" and the boot is fail-closed
 * — the whole web UI stopped on its "Failed to load plugins" card. Nothing in
 * the build noticed, because the type came from an unversioned local checkout.
 *
 * Running `lib/client.js` through the module-table stand-in reproduces the real
 * resolution branch order against the real seed table, so a bundle that would
 * not load in a browser fails here instead.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadBundleText } from './dsh-module-loader.ts'

const BUNDLE = join(process.cwd(), 'lib', 'client.js')

/**
 * The stand-in resolves every seed word by importing the REAL platform
 * packages through vite — and `@deepseek-ai/*` is inlined (vitest.config.ts
 * `server.deps.inline`) because those packages ship `.module.css` sidecars
 * that only vite can turn into modules. That cold import chain (react,
 * react-dom, cordis, client-store, client-ui-slots, client-ui-primitives)
 * measures ~5s on a warm Windows checkout, i.e. it straddles vitest's 5s
 * default and fails as a spurious timeout.
 *
 * This is import cost, not a hang: a genuine module-table miss throws
 * synchronously inside the factory, so it surfaces as a failed assertion
 * (the "missed the module table" error), never as a timeout. The budget below
 * therefore only has to clear the import, not detect a stuck boot.
 */
const SEED_IMPORT_TIMEOUT_MS = 30_000

describe('lib/client.js (shipped browser half)', () => {
  it('materializes against the platform seed table and exposes the plugin face', async () => {
    const exports = await loadBundleText<{ apply: unknown; inject: unknown }>(
      'dsh-multi-chat',
      readFileSync(BUNDLE, 'utf8'),
    )
    expect(typeof exports.apply).toBe('function')
    expect(exports.inject).toEqual(['slots', 'locale'])
  }, SEED_IMPORT_TIMEOUT_MS)

  it('registers under the row id the boot graph expects', async () => {
    // A second materialization of the same row returns the memoized exports —
    // the loader must not run the factory twice (CSS tags would double up).
    const first = await loadBundleText('dsh-multi-chat', readFileSync(BUNDLE, 'utf8'))
    const second = await loadBundleText('dsh-multi-chat', readFileSync(BUNDLE, 'utf8'))
    expect(second).toBe(first)
  }, SEED_IMPORT_TIMEOUT_MS)
})
