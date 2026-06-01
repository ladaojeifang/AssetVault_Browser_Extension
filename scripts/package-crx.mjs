/**
 * Pack dist/ as CRX3 (signed with PEM). First run creates release/assetvault-extension.pem — keep it for updates.
 */
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import crx3 from 'crx3'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const releaseDir = join(root, 'release')

if (!existsSync(dist)) {
  console.error('Run pnpm build first (dist/ missing)')
  process.exit(1)
}

const manifestPath = join(dist, 'manifest.json')
if (!existsSync(manifestPath)) {
  console.error('dist/manifest.json missing')
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
const version = manifest.version || '0.0.0'
const base = `assetvault-extension-v${version}`

mkdirSync(releaseDir, { recursive: true })

const keyPath = join(releaseDir, 'assetvault-extension.pem')
const crxPath = join(releaseDir, `${base}.crx`)
const zipPath = join(releaseDir, `${base}.zip`)

await crx3([manifestPath], {
  keyPath,
  crxPath,
  zipPath
})

console.log('[package-crx] wrote', crxPath)
console.log('[package-crx] key (keep secret, reuse for same extension ID):', keyPath)
if (!existsSync(keyPath)) {
  console.warn('[package-crx] PEM was created on this run — back it up before the next pack with a new key.')
}
