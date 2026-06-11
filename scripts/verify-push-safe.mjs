#!/usr/bin/env node
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ZERO = '0'.repeat(40)

const BLOCKED = [
  /^docs-internal\//,
  /^docs\/ROADMAP_/,
  /^docs\/page-video-import-optimization-plan\.md$/,
  /^docs\/tech-debt-typescript\.md$/,
  /^docs\/fullpage-capture-quality-adoptions\.md$/,
  /^docs\/video-import-ytdlp-pro-requirements\.md$/,
  /^docs\/page-markdown-export-pro-requirements\.md$/,
  /^release\/.*\.pem$/,
  /^\.env/,
  /^dist\//
]

function parseRefs(stdin) {
  const lines = stdin.split('\n').map((l) => l.trim()).filter(Boolean)
  if (!lines.length) return [{ localSha: 'HEAD' }]
  return lines.map((line) => ({ localSha: line.split(/\s+/)[1] ?? 'HEAD' }))
}

function filesAt(sha) {
  return execSync(`git ls-tree -r --name-only ${sha}`, { cwd: root, encoding: 'utf8' })
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

const refs = parseRefs(readFileSync(0, 'utf8'))
const blocked = new Set()
for (const { localSha } of refs) {
  if (!localSha || localSha === ZERO) continue
  for (const f of filesAt(localSha)) {
    const n = f.replace(/\\/g, '/')
    if (BLOCKED.some((re) => re.test(n))) blocked.add(f)
  }
}

if (blocked.size) {
  console.error('\n[pre-push] Blocked paths for public GitHub:\n')
  for (const f of [...blocked].sort()) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('[pre-push] OK')
process.exit(0)
