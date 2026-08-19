import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

/**
 * Vitest config for the dsh-multi-chat test suite.
 *
 * The plugin's unit tests exercise the browser half (jsdom via the spec's
 * per-file pragma) and the node half against the vendored DeepSeek Harness
 * workspace in harness-src/. Module resolution rides tsconfig.vitest.json —
 * a root-located copy of the workspace's tsconfig.base.json paths map (see
 * scripts/sync-vitest-paths.mjs) — so every `@deepseek-ai/*` import resolves
 * to harness sources instead of unbuilt `lib/` outputs. react/react-dom are
 * deduped to this package's own copies so the component specs and
 * @testing-library/react share one React instance.
 */
export default defineConfig({
  plugins: [
    tsconfigPaths({
      projects: ['tsconfig.vitest.json'],
      // The vendored cordis sources contain .js files (src/events.js etc.)
      // whose importers must also get path resolution; loose bypasses the
      // plugin's extension filter.
      loose: true,
    }),
  ],
  resolve: {
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
  },
  // The build tsconfig's `target: "es2024"` string is not an esbuild target
  // and vite reads it for transforms; override so runs are warning-free.
  esbuild: {
    target: 'esnext',
  },
  test: {
    include: ['tests/**/*.spec.tsx'],
    css: true,
  },
})
