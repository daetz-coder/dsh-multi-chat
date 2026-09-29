#!/usr/bin/env node
/**
 * Platform-contract guard for the plugin's browser half.
 *
 * A client plugin bundle is NOT loaded by Node or Vite — it is a factory handed
 * to `window.__ModuleLoader__`, and every `require(spec)` inside it is resolved
 * against the shell's module table. That table has exactly two sources:
 *
 *   1. the platform SEED TABLE — a fixed set of specifiers the web shell
 *      hardcodes into its own Vite bundle, and
 *   2. boot-graph package rows — other plugins' bundles.
 *
 * A plugin can only rely on (1): it cannot conjure another package's row. So a
 * require() of anything outside the seed table throws at materialization time
 * with "missed the module table", and the boot is fail-closed — the whole web
 * UI stops on its "Failed to load plugins" card.
 *
 * That is exactly how v1.0.3 broke: it required
 * `@deepseek-ai/dsh-client-runtime/client`, a package upstream has since
 * deleted. Nothing in the build noticed, because the type came from a local
 * unversioned checkout of the harness monorepo.
 *
 * This script closes that hole: it reads the seed table from
 * platform-seeds.json (the same file tsdown.config.ts builds its externals
 * list from) and fails if the built bundle requires anything else.
 *
 * Usage:
 *   node scripts/check-platform-contract.mjs                    # check lib/client.js
 *   node scripts/check-platform-contract.mjs --against <dsh>    # + diff vs an installed DSH
 *   node scripts/check-platform-contract.mjs --sync <dsh>       # rewrite platform-seeds.json from an installed DSH
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const SEEDS_FILE = join(ROOT, 'platform-seeds.json')
const BUNDLE = join(ROOT, 'lib', 'client.js')

/** Every module specifier a built bundle asks the loader for, in source order. */
function requiredSpecifiers(code) {
  const found = []
  for (const m of code.matchAll(/\brequire(?:\.async)?\(\s*["']([^"']+)["']\s*\)/g)) {
    const spec = m[1]
    // Relative chunk requests are package-local code the loader serves itself.
    if (!spec.startsWith('./') && !spec.startsWith('../')) found.push(spec)
  }
  return [...new Set(found)]
}

/** Locate the web shell bundle inside an installed DSH package directory. */
function findShellBundle(dshRoot) {
  const hits = []
  const walk = (dir, depth) => {
    if (depth > 6 || hits.length > 0) return
    let entries
    try { entries = readdirSync(dir) } catch { return }
    for (const name of entries) {
      const full = join(dir, name)
      let st
      try { st = statSync(full) } catch { continue }
      if (st.isDirectory()) walk(full, depth + 1)
      else if (/^index-[\w-]+\.js$/.test(name) && full.includes('dsh-web-frontend')) hits.push(full)
    }
  }
  walk(dshRoot, 0)
  if (hits.length === 0) throw new Error(`no dsh-web-frontend shell bundle found under ${dshRoot}`)
  return hits[0]
}

/**
 * Read the seed table out of the minified shell.
 * The shell writes it as `staticModules: <fn>()`, where `<fn>` returns the table
 * object literal. Both shapes seen in the wild: `function iE(){return{...}}` on
 * 0.1.7-rc.1 and `function by(){return{...}}` on 0.1.5-rc.2.
 */
function extractSeeds(shellCode) {
  const call = /staticModules\s*:\s*([A-Za-z_$][\w$]*)\s*\(\s*\)/.exec(shellCode)
  if (call === null) throw new Error('shell has no `staticModules: <fn>()` — the boot protocol changed; update this extractor')
  const fn = call[1]
  const body = new RegExp(`function\\s+${fn}\\s*\\(\\)\\s*\\{\\s*return\\s*\\{([^}]*)\\}`).exec(shellCode)
  if (body === null) throw new Error(`could not read the body of seed-table function "${fn}"`)
  const seeds = []
  for (const m of body[1].matchAll(/(?:"((?:[^"\\]|\\.)+)"|([A-Za-z_$][\w$]*))\s*:/g)) {
    seeds.push(m[1] !== undefined ? JSON.parse(`"${m[1]}"`) : m[2])
  }
  return seeds
}

/** Bare (non-`node:`) specifiers the node half imports; those resolve by normal Node rules. */
function nodeHalfSpecifiers() {
  const file = join(ROOT, 'lib', 'index.js')
  if (!existsSync(file)) return []
  const specs = []
  // Anchored to the start of a line so a `from "..."` inside a string literal
  // (error messages, URLs) is not mistaken for an import statement.
  for (const m of readFileSync(file, 'utf8').matchAll(/^import\s+(?:[^"'\n]*?from\s+)?["']([^"']+)["']/gm)) {
    if (!m[1].startsWith('.') && !m[1].startsWith('node:')) specs.push(m[1])
  }
  return [...new Set(specs)]
}

const die = (msg) => { console.error(`\n✗ platform-contract: ${msg}\n`); process.exit(1) }

const argv = process.argv.slice(2)
const flag = (name) => {
  const i = argv.indexOf(name)
  if (i === -1) return undefined
  const value = argv[i + 1]
  if (value === undefined || value.startsWith('--')) die(`${name} needs a path argument`)
  return value
}
const syncTo = flag('--sync')
const against = flag('--against')

// --sync: adopt the seed table of an installed DSH as this repo's contract.
if (syncTo !== undefined) {
  if (!existsSync(syncTo)) die(`--sync path does not exist: ${syncTo}`)
  const seeds = extractSeeds(readFileSync(findShellBundle(syncTo), 'utf8'))
  const prev = JSON.parse(readFileSync(SEEDS_FILE, 'utf8'))
  const version = (() => {
    try { return JSON.parse(readFileSync(join(syncTo, 'package.json'), 'utf8')).version } catch { return undefined }
  })()
  const verified = [...new Set([...(prev.verifiedAgainst ?? []), ...(version === undefined ? [] : [version])])]
  writeFileSync(SEEDS_FILE, `${JSON.stringify({ ...prev, verifiedAgainst: verified, seeds }, null, 2)}\n`)
  console.log(`✓ platform-seeds.json updated from ${syncTo}${version === undefined ? '' : ` (dsh ${version})`}`)
  console.log(`  seeds: ${seeds.join(', ')}`)
  process.exit(0)
}

const { seeds, verifiedAgainst } = JSON.parse(readFileSync(SEEDS_FILE, 'utf8'))
const seedSet = new Set(seeds)

// --against: report drift between the pinned contract and a real installation.
if (against !== undefined) {
  if (!existsSync(against)) die(`--against path does not exist: ${against}`)
  const live = extractSeeds(readFileSync(findShellBundle(against), 'utf8'))
  const liveSet = new Set(live)
  const missing = seeds.filter((s) => !liveSet.has(s))
  const added = live.filter((s) => !seedSet.has(s))
  if (missing.length > 0 || added.length > 0) {
    console.error(`\n✗ platform-contract drift against ${against}`)
    if (missing.length > 0) console.error(`  required but absent upstream: ${missing.join(', ')}`)
    if (added.length > 0) console.error(`  new upstream seeds (run --sync to adopt): ${added.join(', ')}`)
    console.error()
    process.exit(1)
  }
  console.log(`✓ seed table matches ${against}`)
  for (const spec of nodeHalfSpecifiers()) {
    const ok = existsSync(join(against, 'node_modules', ...spec.split('/')))
    if (!ok) die(`node half imports "${spec}" but it is not installed under ${against}`)
  }
}

if (!existsSync(BUNDLE)) die(`built bundle missing: ${BUNDLE} (run the build first)`)
const required = requiredSpecifiers(readFileSync(BUNDLE, 'utf8'))
const offenders = required.filter((spec) => !seedSet.has(spec))

console.log(`platform-contract: lib/client.js requires ${required.length} external module(s)`)
console.log(`  pinned seed table (verified against dsh ${verifiedAgainst.join(', ')}): ${seeds.length} entries`)
for (const spec of required) console.log(`  ${seedSet.has(spec) ? '✓' : '✗'} ${spec}`)

if (offenders.length > 0) {
  die(
    `lib/client.js requires module(s) the platform does not seed: ${offenders.join(', ')}\n` +
    `  A plugin bundle cannot reach these — the boot will fail with "missed the module table"\n` +
    `  and take the whole web UI down. Either import a seed-table package instead, or,\n` +
    `  if upstream genuinely added one, adopt it: npm run sync:platform -- <path-to-installed-dsh>`,
  )
}
console.log('✓ every required module is a platform seed word')
