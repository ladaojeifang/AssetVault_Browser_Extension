import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { defineConfig, build as viteBuild, type Plugin } from 'vite'

const root = __dirname

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.css'])

/** Collect source files under a directory for Rollup watch registration. */
function walkSourceFiles(dir: string, out: string[] = []): string[] {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const ent of entries) {
    const abs = join(dir, ent.name)
    if (ent.isDirectory()) walkSourceFiles(abs, out)
    else {
      const dot = ent.name.lastIndexOf('.')
      if (dot >= 0 && SOURCE_EXTS.has(ent.name.slice(dot))) out.push(abs)
    }
  }
  return out
}

/** Paths that only feed content.js (not main ESM entry graphs). */
const CONTENT_ONLY_WATCH_DIRS = ['src/content', 'src/board-saver'] as const

async function buildContentIife(): Promise<void> {
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
}

/**
 * After ESM entries are written to dist/, build content.js as IIFE.
 * Registers content-only sources with Rollup watch so `pnpm run dev` rebuilds
 * content when board-saver / content files change (they are not main inputs).
 */
function contentScriptIifePlugin(): Plugin {
  let watchMode = false
  let contentBuildPromise: Promise<void> | null = null

  const scheduleContentBuild = (): Promise<void> => {
    if (!contentBuildPromise) {
      contentBuildPromise = buildContentIife().finally(() => {
        contentBuildPromise = null
      })
    }
    return contentBuildPromise
  }

  return {
    name: 'assetvault-content-iife',
    apply: 'build',
    configResolved(config) {
      watchMode = config.build.watch !== null && config.build.watch !== false
    },
    buildStart() {
      if (!watchMode) return
      for (const rel of CONTENT_ONLY_WATCH_DIRS) {
        for (const file of walkSourceFiles(resolve(root, rel))) {
          this.addWatchFile(file)
        }
      }
    },
    async closeBundle() {
      await scheduleContentBuild()
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
