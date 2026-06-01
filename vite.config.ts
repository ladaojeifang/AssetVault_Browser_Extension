import { defineConfig, build as viteBuild, type Plugin } from 'vite'
import { resolve } from 'path'

const root = __dirname

/**
 * After ESM entries are written to dist/, build content.js as IIFE in the same `vite build`.
 * (Rollup cannot emit ESM + IIFE in one pass with different output options.)
 */
function contentScriptIifePlugin(): Plugin {
  return {
    name: 'assetvault-content-iife',
    apply: 'build',
    async closeBundle() {
      await viteBuild({
        configFile: false,
        base: '',
        build: {
          outDir: resolve(root, 'dist'),
          emptyOutDir: false,
          sourcemap: true,
          rollupOptions: {
            input: resolve(root, 'src/content/index.ts'),
            output: {
              format: 'iife',
              entryFileNames: 'content.js',
              inlineDynamicImports: true,
              name: 'AssetVaultContent',
            },
          },
        },
      })
      console.log('[vite] dist/content.js (IIFE)')
    },
  }
}

export default defineConfig({
  base: '',
  plugins: [contentScriptIifePlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        background: resolve(root, 'src/background/service-worker.ts'),
        popup: resolve(root, 'src/popup/popup.ts'),
        batch: resolve(root, 'src/batch/batch.ts'),
        'injected-shot-ui': resolve(root, 'src/shared/injected-shot-ui.ts'),
        'injected-x-scan': resolve(root, 'src/shared/injected-x-scan.ts'),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'injected-shot-ui') return 'injected-shot-ui.js'
          if (chunk.name === 'injected-x-scan') return 'injected-x-scan.js'
          return '[name].js'
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
})
