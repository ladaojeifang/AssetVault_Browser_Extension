#!/usr/bin/env node
/**
 * Live smoke test against a running AssetVault Pro (optional CI / local).
 * Usage: pnpm run smoke:pro
 * Env: ASSETVAULT_API_BASE (default http://127.0.0.1:41596/api/v1)
 *      ASSETVAULT_API_TOKEN (optional Bearer)
 */
const DEFAULT_BASE = 'http://127.0.0.1:41596/api/v1'

function apiBase() {
  const raw = (process.env.ASSETVAULT_API_BASE || DEFAULT_BASE).replace(/\/+$/, '')
  return raw
}

async function jsendGet(path) {
  const base = apiBase()
  const headers = { Accept: 'application/json' }
  const token = (process.env.ASSETVAULT_API_TOKEN || '').trim()
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${base}${path}`, { headers })
  const json = await res.json()
  if (json?.status === 'error') {
    throw new Error(`${json.code}: ${json.message}`)
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return json.data
}

async function main() {
  console.log(`探测 ${apiBase()}/app/info …`)
  const info = await jsendGet('/app/info')
  if (!info?.name || !info?.version) {
    throw new Error('app/info 响应缺少 name/version')
  }
  console.log(`OK: ${info.name} v${info.version}`)
  if (Array.isArray(info.features)) {
    const interesting = ['fullPageSession', 'pageVideoImport', 'articleBundleSession']
    const present = interesting.filter((f) => info.features.includes(f))
    if (present.length) console.log(`features: ${present.join(', ')}`)
  }
}

main().catch((e) => {
  console.error('Smoke 失败:', e instanceof Error ? e.message : e)
  console.error('请确认 AssetVault Pro 已启动且 Web API 已启用')
  process.exit(1)
})
