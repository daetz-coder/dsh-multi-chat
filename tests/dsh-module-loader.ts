/**
 * Stand-in for the web shell's client module table.
 *
 * A client plugin bundle is NOT an ES module. The shell loads it as a plain
 * script whose only top-level effect is `window.__ModuleLoader__.load({ id,
 * factory })`; the factory is materialized later with a synchronous `require`
 * that resolves against the platform seed table (plus any boot-graph package
 * row that already registered). A file like that has no exports, so vitest
 * cannot `import` it — `@deepseek-ai/dsh-client-ui-renderer/client` and friends
 * evaluate to `undefined`.
 *
 * This module reproduces the real contract instead: install the facade, run
 * the bundle text, and materialize its factory against the same seed table the
 * shell uses (platform-seeds.json). Specs therefore exercise the platform's
 * SHIPPED bundles rather than a source checkout, and a bundle that requires a
 * module outside the seed table fails here the same way it fails in a browser.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { runInThisContext } from 'node:vm'

// vitest rewrites import.meta.url to a non-file URL, so anchor on the project
// root instead (vitest runs with the package root as cwd).
const ROOT = process.cwd()
const nodeRequire = createRequire(join(ROOT, 'package.json'))
const { seeds } = JSON.parse(readFileSync(join(ROOT, 'platform-seeds.json'), 'utf8')) as {
  seeds: string[]
}

type Factory = (require: (spec: string) => unknown) => unknown

const seed = new Map<string, unknown>()
const factories = new Map<string, Factory>()
const materialized = new Map<string, unknown>()

const shell = globalThis as unknown as {
  window: { __ModuleLoader__?: { load(entry: { id: string; factory: Factory }): void } }
}
shell.window.__ModuleLoader__ = {
  load(entry) {
    factories.set(entry.id, entry.factory)
  },
}

/** `@deepseek-ai/x/client` and `@deepseek-ai/x` name the same table row. */
const rowId = (spec: string) => (spec.endsWith('/client') ? spec.slice(0, -'/client'.length) : spec)

/**
 * Seed word -> the real package, exactly as the shell's own table resolves.
 * Spelled as static imports so vite (not bare Node) loads them: the platform
 * packages import `.module.css` files, which only vite can turn into modules.
 * A seed with no installable package (dsh-client-ui-dockkit ships inside the
 * web bundle) is simply absent — nothing under test requires it.
 */
const SEED_MODULES: Readonly<Record<string, () => Promise<unknown>>> = {
  'react': () => import('react'),
  'react/jsx-runtime': () => import('react/jsx-runtime'),
  'react-dom': () => import('react-dom'),
  'react-dom/client': () => import('react-dom/client'),
  '@deepseek-ai/cordis': () => import('@deepseek-ai/cordis'),
  '@deepseek-ai/dsh-client-store': () => import('@deepseek-ai/dsh-client-store'),
  '@deepseek-ai/dsh-client-ui-slots': () => import('@deepseek-ai/dsh-client-ui-slots'),
  '@deepseek-ai/dsh-client-ui-primitives': () => import('@deepseek-ai/dsh-client-ui-primitives'),
}

let seedsLoaded: Promise<void> | undefined

/** Resolve every seed the platform table lists and this repo can install. */
function loadSeeds(): Promise<void> {
  seedsLoaded ??= (async () => {
    for (const spec of seeds) {
      const load = SEED_MODULES[spec]
      if (load !== undefined) seed.set(spec, await load())
    }
  })()
  return seedsLoaded
}

/** Materialize a registered factory (synchronous, memoized — as the real loader is). */
function materialize(id: string): unknown {
  if (materialized.has(id)) return materialized.get(id)
  const factory = factories.get(id)
  if (factory === undefined) throw new Error(`test loader: no registered factory for "${id}"`)
  const exports = factory((spec) => {
    if (seed.has(spec)) return seed.get(spec)
    const dep = rowId(spec)
    if (materialized.has(dep)) return materialized.get(dep)
    if (factories.has(dep)) return materialize(dep)
    throw new Error(
      `test loader: require("${spec}") missed the module table — not a platform seed word, ` +
      `not a materialized module, and no registered package factory`,
    )
  })
  materialized.set(id, exports)
  return exports
}

/**
 * Load a client plugin bundle from source text and return its materialized
 * exports — the same path the shell takes for a served `/plugins/??…` script.
 * @param id - the row id the bundle registers under.
 * @param code - the bundle's source text.
 * @param filename - name to report in stack traces.
 * @returns the bundle's exports.
 */
export async function loadBundleText<T = Record<string, unknown>>(
  id: string,
  code: string,
  filename = `${id}/client.js`,
): Promise<T> {
  await loadSeeds()
  runInThisContext(code, { filename })
  return materialize(rowId(id)) as T
}

/**
 * Load an installed client plugin bundle and return its materialized exports.
 * @param specifier - package specifier, with or without the `/client` suffix.
 * @returns the bundle's exports.
 */
export async function loadBundle<T = Record<string, unknown>>(specifier: string): Promise<T> {
  await loadSeeds()
  const id = rowId(specifier)
  if (!factories.has(id)) {
    const file = nodeRequire.resolve(specifier)
    runInThisContext(readFileSync(file, 'utf8'), { filename: file })
  }
  return materialize(id) as T
}
