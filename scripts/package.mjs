import { createWriteStream, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import archiver from 'archiver'
import { readFileSync } from 'fs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const releaseDir = join(root, 'release')

if (!existsSync(dist)) {
  console.error('Run pnpm build first (dist/ missing)')
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf-8'))
const version = manifest.version || '0.0.0'
const zipName = `assetvault-extension-v${version}.zip`

mkdirSync(releaseDir, { recursive: true })
const outPath = join(releaseDir, zipName)

await new Promise((resolve, reject) => {
  const output = createWriteStream(outPath)
  const archive = archiver('zip', { zlib: { level: 9 } })
  output.on('close', resolve)
  archive.on('error', reject)
  archive.pipe(output)
  archive.directory(dist, false)
  archive.finalize()
})

console.log('[package] wrote', outPath)
