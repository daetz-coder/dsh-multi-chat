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

describe('lib/client.js (shipped browser half)', () => {
  it('materializes against the platform seed table and exposes the plugin face', async () => {
    const exports = await loadBundleText<{ apply: unknown; inject: unknown }>(
      'dsh-multi-chat',
      readFileSync(BUNDLE, 'utf8'),
    )
    expect(typeof exports.apply).toBe('function')
    expect(exports.inject).toEqual(['slots', 'locale'])
  })

  it('registers under the row id the boot graph expects', async () => {
    // A second materialization of the same row returns the memoized exports —
    // the loader must not run the factory twice (CSS tags would double up).
    const first = await loadBundleText('dsh-multi-chat', readFileSync(BUNDLE, 'utf8'))
    const second = await loadBundleText('dsh-multi-chat', readFileSync(BUNDLE, 'utf8'))
    expect(second).toBe(first)
  })
})
