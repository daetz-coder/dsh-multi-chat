/**
 * tsdown build config for dsh-multi-chat single-package structure.
 * Produces:
 *   - lib/index.js (ESM, node) from src/index.ts
 *   - lib/client.js (CJS, browser, with ModuleLoader wrapper) from src/client/index.ts
 *   - lib/types/*.d.ts (type declarations)
 */
import { defineConfig } from 'tsdown'
import { transform } from 'lightningcss'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPOSITORY_ROOT = fileURLToPath(new URL('.', import.meta.url))

// DSH client externals - the platform seed table, resolved by the loader's
// module table at runtime. Single source of truth: platform-seeds.json, which
// scripts/check-platform-contract.mjs also reads, so the build config and the
// post-build guard can never disagree. A specifier that is not a seed word is
// not reachable from a plugin bundle at all.
const CLIENT_EXTERNALS: string[] = JSON.parse(
  readFileSync(new URL('./platform-seeds.json', import.meta.url), 'utf8'),
).seeds

function browserSourcePath(source: string, sourcemapPath: string): string {
  if (!source.startsWith('.')) return source
  const physicalSource = resolve(dirname(sourcemapPath), source)
  const repositoryPath = relative(REPOSITORY_ROOT, physicalSource).split(sep).join('/')
  return repositoryPath.startsWith('src/') ? `../${repositoryPath}` : source
}

/**
 * Repo-relative, forward-slashed path.
 *
 * Both consumers below must stay machine-independent. The CSS plugin's virtual
 * id is echoed verbatim into the bundle's `//#region` comment, so an absolute
 * path publishes the build machine's directory layout; and the filename handed
 * to lightningcss feeds the `[hash]` in `[hash]_[local]`, so an absolute path
 * gives every checkout a different set of CSS class names. Either one makes the
 * artifact unreproducible and turns a source change into a whole-bundle diff.
 */
function repoRelative(absolutePath: string): string {
  return relative(REPOSITORY_ROOT, absolutePath).split(sep).join('/')
}

export default defineConfig([
  // Node half (ESM) - produces lib/index.js
  {
    name: 'dsh-multi-chat',
    entry: { index: 'src/index.ts', invariant: 'src/invariant.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    dts: false, // We'll use tsc for types
    clean: false,
    external: [
      '@deepseek-ai/cordis',
      '@deepseek-ai/schemastery',
      '@deepseek-ai/dsh-host-webserver',
    ],
  },
  // Client half (CJS with ModuleLoader wrapper) - produces lib/client.js
  {
    name: 'dsh-multi-chat/client',
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    sourcemap: true,
    clean: false,
    external: CLIENT_EXTERNALS,
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    },
    noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
    plugins: [
      {
        name: 'dsh-client-bundle-purity',
        resolveId(source: string) {
          if (!source.startsWith('@deepseek-ai/')) return null
          if (CLIENT_EXTERNALS.includes(source)) return null
          throw new Error(
            `client bundle purity: "${source}" is not a platform module — cross-plugin value imports are forbidden`
          )
        },
      },
      {
        name: 'dsh-css-modules-inline',
        resolveId(source: string, importer: string | undefined) {
          if (!source.endsWith('.module.css')) return null
          const abs = importer !== undefined ? resolve(dirname(importer), source) : source
          return `\0dsh-css:${repoRelative(abs)}.mjs`
        },
        async load(virtualId: string) {
          if (!virtualId.startsWith('\0dsh-css:')) return null
          const repositoryPath = virtualId.slice('\0dsh-css:'.length, -'.mjs'.length)
          const fileId = resolve(REPOSITORY_ROOT, repositoryPath)
          this.addWatchFile(fileId)
          const source = await readFile(fileId)
          const { code, exports: cssExports } = transform({
            // Relative, not absolute: this is what keeps `[hash]` stable
            // across checkouts, so the class map below is reproducible.
            filename: repositoryPath,
            code: source,
            cssModules: { pattern: '[hash]_[local]' },
            minify: true,
          })
          const classMap: Record<string, string> = {}
          // Sorted: lightningcss hands back its exports in a hash-dependent
          // order, so copying them verbatim reshuffles the emitted object on
          // every build and makes an untouched CSS file look changed.
          for (const local of Object.keys(cssExports ?? {}).sort()) {
            classMap[local] = (cssExports as Record<string, { name: string }>)[local].name
          }
          return [
            `const css = ${JSON.stringify(code.toString())};`,
            `const tagId = ${JSON.stringify(`dsh-multi-chat/${basename(fileId)}`)};`,
            'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
            '  const tag = document.createElement(\'style\');',
            `  tag.dataset.plugin = ${JSON.stringify('dsh-multi-chat')};`,
            '  tag.dataset.pluginCss = tagId;',
            '  tag.textContent = css;',
            '  document.head.appendChild(tag);',
            '}',
            `export default ${JSON.stringify(classMap)};`,
          ].join('\n')
        },
      },
    ],
    outputOptions: {
      entryFileNames: 'client.js',
      sourcemapPathTransform: browserSourcePath,
      banner: 'window.__ModuleLoader__.load({ id: "dsh-multi-chat", factory: (require) => {',
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
