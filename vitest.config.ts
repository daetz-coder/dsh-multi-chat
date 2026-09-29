import { defineConfig } from 'vitest/config'

/**
 * Vitest config for the dsh-multi-chat test suite.
 *
 * The plugin's unit tests exercise the browser half (jsdom via the spec's
 * per-file pragma) and the node half against the real platform packages, which
 * are pinned as exact devDependencies in package.json. They used to resolve to
 * a local unversioned checkout of the harness monorepo via a generated
 * tsconfig paths map; that is what let the plugin drift onto module names the
 * platform had already deleted. Resolution is now plain node_modules, so the
 * tests fail loudly when the platform surface moves.
 *
 * react/react-dom are deduped to this package's own copies so the component
 * specs and @testing-library/react share one React instance.
 */
export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
  },
  // The build tsconfig's `target: "es2024"` string is not an esbuild target
  // and vite reads it for transforms; override so runs are warning-free.
  esbuild: {
    target: 'esnext',
  },
  test: {
    include: ['tests/**/*.spec.{ts,tsx}'],
    // The platform packages ship `.module.css` sidecars, which only vite can
    // resolve. Inlining them keeps them in vite's module graph instead of
    // handing them to bare Node.
    server: { deps: { inline: [/@deepseek-ai\//] } },
    css: true,
  },
})
