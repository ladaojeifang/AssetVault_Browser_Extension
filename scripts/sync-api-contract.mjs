#!/usr/bin/env node
/**
 * Copy Pro OpenAPI into contracts/web-api-v1-openapi.yaml when repos are side-by-side.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXT_ROOT = path.resolve(__dirname, '..')
const PRO_OPENAPI = path.resolve(EXT_ROOT, '../AssetVault_Pro/doc/web-api-v1-openapi.yaml')
const DEST = path.join(EXT_ROOT, 'contracts/web-api-v1-openapi.yaml')

function main() {
  if (!fs.existsSync(PRO_OPENAPI)) {
    if (fs.existsSync(DEST)) {
      console.log(`Pro 未找到 (${PRO_OPENAPI})，保留现有契约镜像`)
      process.exit(0)
    }
    console.error(`错误: 无 Pro OpenAPI 且无本地镜像。请并列克隆 AssetVault_Pro 或提交 contracts/web-api-v1-openapi.yaml`)
    process.exit(1)
  }

  fs.mkdirSync(path.dirname(DEST), { recursive: true })
  const next = fs.readFileSync(PRO_OPENAPI, 'utf8')
  const prev = fs.existsSync(DEST) ? fs.readFileSync(DEST, 'utf8') : ''

  if (next === prev) {
    console.log('契约镜像已是最新')
    process.exit(0)
  }

  fs.writeFileSync(DEST, next)
  console.log(`已同步: AssetVault_Pro/doc/web-api-v1-openapi.yaml → contracts/web-api-v1-openapi.yaml`)
}

main()
