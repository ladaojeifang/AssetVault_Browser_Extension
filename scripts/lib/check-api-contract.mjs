import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openApiHasOperation, parseOpenApiPathMethods } from './openapi-paths.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXT_ROOT = path.resolve(__dirname, '../..')

const OPENAPI_MIRROR = path.join(EXT_ROOT, 'contracts/web-api-v1-openapi.yaml')
const SURFACE_JSON = path.join(EXT_ROOT, 'contracts/extension-api-surface.json')

/**
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
 */
export function checkApiContract(options = {}) {
  const root = options.root ?? EXT_ROOT
  const openapiPath = options.openapiPath ?? path.join(root, 'contracts/web-api-v1-openapi.yaml')
  const surfacePath = options.surfacePath ?? path.join(root, 'contracts/extension-api-surface.json')

  const errors = []
  const warnings = []

  if (!fs.existsSync(openapiPath)) {
    errors.push(`缺少 OpenAPI 镜像: ${openapiPath}（先运行 pnpm run contract:sync）`)
    return { ok: false, errors, warnings }
  }
  if (!fs.existsSync(surfacePath)) {
    errors.push(`缺少扩展调用面: ${surfacePath}`)
    return { ok: false, errors, warnings }
  }

  const openapi = parseOpenApiPathMethods(fs.readFileSync(openapiPath, 'utf8'))
  const surface = JSON.parse(fs.readFileSync(surfacePath, 'utf8'))
  const endpoints = surface.endpoints ?? []

  for (const ep of endpoints) {
    if (ep.probe) continue
    const p = ep.path
    const m = String(ep.method || '').toUpperCase()
    if (!p || !m) {
      errors.push(`无效 surface 项: ${JSON.stringify(ep)}`)
      continue
    }
    if (!openApiHasOperation(openapi, p, m)) {
      errors.push(`OpenAPI 未声明 ${m} ${p}（来源 ${ep.source ?? 'unknown'}）`)
    }
  }

  if (openapi.size === 0) {
    warnings.push('OpenAPI paths 解析结果为空，请检查镜像文件格式')
  }

  return { ok: errors.length === 0, errors, warnings }
}
