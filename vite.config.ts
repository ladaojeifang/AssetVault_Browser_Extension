import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  base: '',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/service-worker.ts'),
        popup: resolve(__dirname, 'src/popup/popup.ts'),
        batch: resolve(__dirname, 'src/batch/batch.ts'),
        'injected-shot-ui': resolve(__dirname, 'src/shared/injected-shot-ui.ts'),
        'injected-x-scan': resolve(__dirname, 'src/shared/injected-x-scan.ts'),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'injected-shot-ui') return 'injected-shot-ui.js'
          if (chunk.name === 'injected-x-scan') return 'injected-x-scan.js'
          return '[name].js'
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]'
      }
    }
  }
})
