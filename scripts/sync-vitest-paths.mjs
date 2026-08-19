#!/usr/bin/env node
/**
 * Regenerate tsconfig.vitest.json from the vendored harness workspace's
 * tsconfig.base.json paths map.
 *
 * The vitest config resolves every `@deepseek-ai/*` import to harness
 * sources through vite-tsconfig-paths. The base map's targets are relative
 * to harness-src/, while tsconfig.vitest.json lives at the repo root, so
 * every target is rewritten with a `harness-src/` prefix (and the locale
 * source fixture import the tests use is added — the base wildcards do not
 * cover it).
 *
 * Run after updating harness-src/: `node scripts/sync-vitest-paths.mjs`
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const basePath = resolve(ROOT, 'harness-src/tsconfig.base.json')
const outPath = resolve(ROOT, 'tsconfig.vitest.json')

// Strip JSONC comments (line // and block /* */), preserving string contents.
function stripJsonc(source) {
  let out = ''
  let inString = false
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    const n = source[i + 1]
    if (inString) {
      out += c
      if (c === '\\') { out += n ?? ''; i++ }
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') { inString = true; out += c; continue }
    if (c === '/' && n === '/') { while (i < source.length && source[i] !== '\n') i++; continue }
    if (c === '/' && n === '*') {
      i += 2
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++
      i++
      continue
    }
    out += c
  }
  return out
}

const base = JSON.parse(stripJsonc(readFileSync(basePath, 'utf8')))
const paths = {}
for (const [key, targets] of Object.entries(base.compilerOptions.paths)) {
  paths[key] = targets.map(target => (target.startsWith('./') ? `harness-src/${target.slice(2)}` : target))
}
// Deep locale source import used by the test suite; not covered by the base
// wildcards (the generic `@deepseek-ai/dsh-*` map mis-substitutes subpaths).
paths['@deepseek-ai/dsh-client-locale/src/*'] = ['harness-src/packages/client/locale/src/*']

const result = {
  extends: './harness-src/tsconfig.base.json',
  compilerOptions: { paths },
}
writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
console.log(`tsconfig.vitest.json: ${Object.keys(paths).length} path entries`)
