import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const publicDir = join(root, 'public')

mkdirSync(dist, { recursive: true })

// manifest
copyFileSync(join(root, 'src/manifest.json'), join(dist, 'manifest.json'))

// static pages
for (const page of ['popup', 'batch']) {
  copyFileSync(join(root, `src/${page}/${page}.html`), join(dist, `${page}.html`))
  const css = join(root, `src/${page}/${page}.css`)
  if (existsSync(css)) {
    copyFileSync(css, join(dist, `${page}.css`))
  }
}

// content css
copyFileSync(join(root, 'src/content/content.css'), join(dist, 'content.css'))

// board-saver bridge CSS (not handled by Vite — injected dynamically)
const bridgeCssSrc = join(root, 'src/board-saver/board-saver-bridge.css')
if (existsSync(bridgeCssSrc)) {
  copyFileSync(bridgeCssSrc, join(dist, 'board-saver-bridge.css'))
}

// icons: prefer public/icons, fallback repo resources/icon.png
const iconsOut = join(dist, 'icons')
mkdirSync(iconsOut, { recursive: true })
const iconSrc =
  existsSync(join(publicDir, 'icons', 'icon128.png'))
    ? join(publicDir, 'icons')
    : join(root, '..', 'resources')
const iconFile = existsSync(join(iconSrc, 'icon128.png'))
  ? 'icon128.png'
  : existsSync(join(iconSrc, 'icon.png'))
    ? 'icon.png'
    : null

if (iconFile) {
  const src = join(iconSrc, iconFile)
  for (const size of [16, 48, 128]) {
    copyFileSync(src, join(iconsOut, `icon${size}.png`))
  }
} else {
  console.warn('[postbuild] No icons found — add public/icons/icon128.png')
}

const missingIcons = [16, 48, 128].filter(
  (size) => !existsSync(join(iconsOut, `icon${size}.png`)),
)
if (missingIcons.length) {
  console.error(
    `[postbuild] Missing manifest icons: ${missingIcons.map((s) => `icon${s}.png`).join(', ')}`,
  )
  process.exit(1)
}

console.log('[postbuild] dist ready:', dist)
