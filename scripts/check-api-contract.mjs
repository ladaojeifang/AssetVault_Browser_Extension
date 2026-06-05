#!/usr/bin/env node
import { checkApiContract } from './lib/check-api-contract.mjs'

const { ok, errors, warnings } = checkApiContract()

for (const w of warnings) console.warn(`警告: ${w}`)
for (const e of errors) console.error(`错误: ${e}`)

if (!ok) {
  console.error('\n契约检查失败。若 Pro 已更新 API，请: pnpm run contract:sync && 更新 extension-api-surface.json')
  process.exit(1)
}

console.log('契约检查通过（extension-api-surface ⊆ OpenAPI 镜像）')
process.exit(0)
