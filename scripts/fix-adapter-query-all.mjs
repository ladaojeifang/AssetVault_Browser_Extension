/**
 * Bulk-fix site-adapters: querySelectorAll on img selectors → HTMLImageElement generic.
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'shared', 'site-adapters')

const IMG_GENERIC = [
  [/document\.querySelectorAll\('img'\)/g, "document.querySelectorAll<HTMLImageElement>('img')"],
  [/document\.querySelectorAll\("img"\)/g, 'document.querySelectorAll<HTMLImageElement>("img")'],
  [/document\.querySelectorAll\('video'\)/g, "document.querySelectorAll<HTMLVideoElement>('video')"],
  [/document\.querySelectorAll\("video"\)/g, 'document.querySelectorAll<HTMLVideoElement>("video")'],
  [
    /Array\.from\(document\.querySelectorAll\(([^)]+)\)\)/g,
    'Array.from(document.querySelectorAll<HTMLImageElement>($1))',
  ],
  [
    /for \(const img of document\.querySelectorAll\(([^)]+)\)\)/g,
    'for (const img of document.querySelectorAll<HTMLImageElement>($1))',
  ],
]

let changed = 0
for (const name of readdirSync(dir)) {
  if (!name.endsWith('.ts') || name === 'index.ts') continue
  const path = join(dir, name)
  let src = readFileSync(path, 'utf8')
  const before = src
  for (const [re, rep] of IMG_GENERIC) {
    src = src.replace(re, rep)
  }
  if (src !== before) {
    writeFileSync(path, src)
    changed++
    console.log('updated', name)
  }
}
console.log(`[fix-adapter-query-all] ${changed} files`)
