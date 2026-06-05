/**
 * 与 Pro OpenAPI 对齐的共享类型（手写子集）。
 * 完整 schema 见 contracts/web-api-v1-openapi.yaml；可选生成见 pnpm run contract:gen
 */
import type { JSendError, JSendSuccess } from './types'

export type { JSendError, JSendSuccess }

/** GET /app/info — components.schemas.AppInfo */
export type AppInfo = {
  name: string
  version: string
  apiVersion?: 'v1'
  platform?: string
  packaged?: boolean
  features?: string[]
}

/** POST /asset/fetchRemoteBody — 响应 data */
export type FetchRemoteBodyResult = {
  dataUrl: string
  bytes: number
  contentType: string | null
}

/** POST /asset/importFromURL 等 — 响应 data（简化） */
export type ImportAssetResult = {
  skipped: boolean
  assetId?: string
  reason?: string
  existingAssetId?: string
}
