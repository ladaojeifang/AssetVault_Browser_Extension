import { execFile } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { defineConfig, build as viteBuild, type Plugin } from 'vite'

const root = __dirname
const execFileAsync = promisify(execFile)

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.css', '.html', '.json'])

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

const CONTENT_ONLY_WATCH_DIRS = ['src/content', 'src/board-saver'] as const

const FULLPAGE_INJECTED_WATCH_FILES = [
  'src/shared/fullpage-injected.ts',
  'src/shared/fullpage-page-helpers.ts',
] as const

const PAGE_MARKDOWN_INJECTED_WATCH_DIRS = ['src/page-markdown'] as const

/** Static assets copied by scripts/postbuild.mjs (not Vite JS entries). */
const POSTBUILD_WATCH_PATHS = [
  'src/manifest.json',
  'src/content/content.css',
  'src/board-saver/board-saver-bridge.css',
] as const

const POSTBUILD_WATCH_DIRS = ['src/popup', 'src/batch'] as const

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

/** Page inject via chrome.scripting.executeScript files — must be classic IIFE (no import). */
async function buildFullpageInjectedIife(): Promise<void> {
  await viteBuild({
    configFile: false,
    base: '',
    build: {
      outDir: resolve(root, 'dist'),
      emptyOutDir: false,
      sourcemap: true,
      rollupOptions: {
        input: resolve(root, 'src/shared/fullpage-injected.ts'),
        output: {
          format: 'iife',
          entryFileNames: 'fullpage-injected.js',
          inlineDynamicImports: true,
          name: 'AssetVaultFullpageInjected',
        },
      },
    },
  })
  console.log('[vite] dist/fullpage-injected.js (IIFE)')
}

async function buildPageMarkdownInjectedIife(): Promise<void> {
  await viteBuild({
    configFile: false,
    base: '',
    build: {
      outDir: resolve(root, 'dist'),
      emptyOutDir: false,
      sourcemap: true,
      rollupOptions: {
        input: resolve(root, 'src/page-markdown/page-markdown-injected.ts'),
        output: {
          format: 'iife',
          entryFileNames: 'page-markdown-injected.js',
          inlineDynamicImports: true,
          name: 'AssetVaultPageMarkdownInjected',
        },
      },
    },
  })
  console.log('[vite] dist/page-markdown-injected.js (IIFE)')
}

async function buildPageInjectedIifeBundles(): Promise<void> {
  await buildContentIife()
  await buildFullpageInjectedIife()
  await buildPageMarkdownInjectedIife()
}

async function runPostbuild(): Promise<void> {
  await execFileAsync(process.execPath, ['scripts/postbuild.mjs'], { cwd: root })
  console.log('[vite] postbuild copied static assets')
}

function contentScriptIifePlugin(): Plugin {
  let watchMode = false
  let contentBuildPromise: Promise<void> | null = null

  const scheduleContentBuild = (): Promise<void> => {
    if (!contentBuildPromise) {
      contentBuildPromise = buildPageInjectedIifeBundles().finally(() => {
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
      for (const rel of FULLPAGE_INJECTED_WATCH_FILES) {
        this.addWatchFile(resolve(root, rel))
      }
      for (const rel of PAGE_MARKDOWN_INJECTED_WATCH_DIRS) {
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

/** Copy manifest, HTML/CSS, icons after each dev/build pass. */
function postbuildStaticPlugin(): Plugin {
  let watchMode = false
  let postbuildPromise: Promise<void> | null = null

  const schedulePostbuild = (): Promise<void> => {
    if (!postbuildPromise) {
      postbuildPromise = runPostbuild().finally(() => {
        postbuildPromise = null
      })
    }
    return postbuildPromise
  }

  return {
    name: 'assetvault-postbuild-static',
    apply: 'build',
    configResolved(config) {
      watchMode = config.build.watch !== null && config.build.watch !== false
    },
    buildStart() {
      if (!watchMode) return
      for (const rel of POSTBUILD_WATCH_PATHS) {
        this.addWatchFile(resolve(root, rel))
      }
      for (const rel of POSTBUILD_WATCH_DIRS) {
        for (const file of walkSourceFiles(resolve(root, rel))) {
          this.addWatchFile(file)
        }
      }
    },
    async closeBundle() {
      await schedulePostbuild()
    },
  }
}

export default defineConfig({
  base: '',
  plugins: [contentScriptIifePlugin(), postbuildStaticPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        background: resolve(root, 'src/background/service-worker.ts'),
        popup: resolve(root, 'src/popup/popup.ts'),
        batch: resolve(root, 'src/batch/batch.ts'),
        offscreen: resolve(root, 'src/offscreen/offscreen.ts'),
        'injected-shot-ui': resolve(root, 'src/shared/injected-shot-ui.ts'),
        'injected-x-scan': resolve(root, 'src/shared/injected-x-scan.ts'),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'injected-shot-ui') return 'injected-shot-ui.js'
          if (chunk.name === 'injected-x-scan') return 'injected-x-scan.js'
          if (chunk.name === 'offscreen') return 'offscreen.js'
          return '[name].js'
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
})
