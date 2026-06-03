import { apiUrl, getPreferences } from './config'
import type {
  FolderNode,
  ImportFromUrlBatchResult,
  ImportFromUrlResult,
  JSendSuccess,
  JSendError
} from './types'

export async function apiRequest<T>(
  path: string,
  init?: RequestInit & { query?: Record<string, string>; timeoutMs?: number }
): Promise<T> {
  const prefs = await getPreferences()
  let url = apiUrl(prefs, path)
  if (init?.query) {
    const u = new URL(url)
    for (const [k, v] of Object.entries(init.query)) u.searchParams.set(k, v)
    url = u.toString()
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init?.headers as Record<string, string> | undefined)
  }
  if (prefs.token.trim()) {
    headers.Authorization = `Bearer ${prefs.token.trim()}`
  }

  const { query: _q, timeoutMs: requestTimeoutMs, ...fetchInit } = init ?? {}
  const controller = new AbortController()
  const timeoutMs = requestTimeoutMs ?? 10_000
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetch(url, {
      ...fetchInit,
      headers,
      signal: controller.signal
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`请求超时: AssetVault Pro 可能未启动`)
    }
    throw e
  } finally {
    clearTimeout(timeoutId)
  }

  let json: unknown
  try {
    json = await res.json()
  } catch {
    throw new Error(`HTTP ${res.status}: 服务端返回非 JSON 响应`)
  }

  const jsend = json as JSendSuccess<T> | JSendError
  if (jsend.status === 'error') {
    throw new Error(`${jsend.code}: ${jsend.message}`)
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  return jsend.data
}

export async function pingApp(): Promise<{ name: string; version: string }> {
  return apiRequest('/app/info')
}

export async function getFolderTree(): Promise<FolderNode[]> {
  const data = await apiRequest<FolderNode[] | { data: FolderNode[] }>('/folder/tree')
  if (Array.isArray(data)) return data
  return data.data ?? []
}

export async function importFromUrl(body: {
  url: string
  filename?: string
  targetFolderId?: string
  duplicatePolicy?: string
  headers?: Record<string, string>
}): Promise<ImportFromUrlResult> {
  return apiRequest('/asset/importFromURL', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

export async function importFromUrlBatch(body: {
  items: Array<{ url: string; filename?: string; headers?: Record<string, string> }>
  targetFolderId?: string
  duplicatePolicy?: string
}): Promise<ImportFromUrlBatchResult> {
  return apiRequest('/asset/importFromURLBatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

export async function assignTags(assetIds: string[], tagIds: string[]): Promise<void> {
  await apiRequest('/tag/assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assetIds, tagIds })
  })
}

export async function updateAsset(body: {
  id: string
  sourceUrl?: string
  notes?: string
}): Promise<void> {
  await apiRequest('/asset/update', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

export async function importAsset(body: {
  filePath: string
  targetFolderId?: string
  duplicatePolicy?: string
}): Promise<ImportFromUrlResult> {
  return apiRequest('/asset/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

export async function importFromDataUrl(
  body: {
    dataUrl: string
    filename?: string
    targetFolderId?: string
    duplicatePolicy?: string
  },
  options?: { timeoutMs?: number },
): Promise<ImportFromUrlResult> {
  return apiRequest('/asset/importFromDataUrl', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeoutMs: options?.timeoutMs,
  })
}
