#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const internalRoot = join(root, 'docs-internal')

const MIGRATIONS = [
  { from: 'docs/ROADMAP_2026.md', to: 'planning/ROADMAP_2026.md' },
  { from: 'docs/page-video-import-optimization-plan.md', to: 'maintenance/page-video-import-optimization-plan.md' },
  { from: 'docs/tech-debt-typescript.md', to: 'maintenance/tech-debt-typescript.md' },
  { from: 'docs/fullpage-capture-quality-adoptions.md', to: 'maintenance/fullpage-capture-quality-adoptions.md' },
  { from: 'docs/video-import-ytdlp-pro-requirements.md', to: 'planning/video-import-ytdlp-pro-requirements.md' },
  { from: 'docs/page-markdown-export-pro-requirements.md', to: 'planning/page-markdown-export-pro-requirements.md' }
]

function migrate(fromRel, toRel) {
  const from = join(root, fromRel)
  const to = join(internalRoot, toRel)
  if (!existsSync(from)) return false
  mkdirSync(dirname(to), { recursive: true })
  cpSync(from, to)
  console.log(`  copied: ${fromRel} → docs-internal/${toRel}`)
  try {
    execSync(`git rm -f --ignore-unmatch "${fromRel.replace(/\//g, '/')}"`, { cwd: root, stdio: 'pipe' })
  } catch {
    /* ignore */
  }
  return true
}

mkdirSync(internalRoot, { recursive: true })
cpSync(join(root, 'docs-internal.template/README.md'), join(internalRoot, 'README.md'))
for (const { from, to } of MIGRATIONS) migrate(from, to)

if (!existsSync(join(internalRoot, '.git'))) {
  try {
    execSync('git init -b main', { cwd: internalRoot, stdio: 'inherit' })
    writeFileSync(join(internalRoot, '.gitignore'), '.local/\n')
    execSync('git add .', { cwd: internalRoot, stdio: 'inherit' })
    execSync('git commit -m "chore: initial internal docs"', { cwd: internalRoot, stdio: 'inherit' })
  } catch {
    console.log('Nested git commit skipped (configure user.name/email in docs-internal/)')
  }
}
console.log('Done.')
