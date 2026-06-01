import * as esbuild from 'esbuild'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

await esbuild.build({
  entryPoints: [resolve(root, 'src/content/index.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  outfile: resolve(root, 'dist/content.js'),
  sourcemap: true,
  logLevel: 'info'
})

console.log('[build-content] dist/content.js (IIFE bundle)')
