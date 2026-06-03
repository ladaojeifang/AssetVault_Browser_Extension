import { apiRequest, pingApp } from './api'
import type {
  ArticleBundleSessionAbortResult,
  ArticleBundleSessionAppendResult,
  ArticleBundleSessionFinishResult,
  ArticleBundleSessionStartResult
} from './article-bundle-session-types'

export const ARTICLE_BUNDLE_SESSION_APPEND_TIMEOUT_MS = 60_000
export const ARTICLE_BUNDLE_SESSION_FINISH_TIMEOUT_MS = 180_000
export const ARTICLE_BUNDLE_SESSION_START_TIMEOUT_MS = 15_000

let cachedArticleBundleSessionSupport: boolean | null = null
let cachedArticleBundleSessionSupportAt = 0
const ARTICLE_BUNDLE_SESSION_SUPPORT_CACHE_MS = 5 * 60 * 1000

export async function supportsArticleBundleSessionApi(): Promise<boolean> {
  const now = Date.now()
  if (
    cachedArticleBundleSessionSupport !== null &&
    now - cachedArticleBundleSessionSupportAt < ARTICLE_BUNDLE_SESSION_SUPPORT_CACHE_MS
  ) {
    return cachedArticleBundleSessionSupport
  }
  try {
    await pingApp()
    await apiRequest('/asset/articleBundleSession/ab___capability_probe___', {
      method: 'GET',
      timeoutMs: 8000
    })
    cachedArticleBundleSessionSupport = false
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/ARTICLE_BUNDLE_SESSION_NOT_FOUND|ARTICLE_BUNDLE_SESSION_EXPIRED|FULLPAGE_SESSION_NOT_FOUND/i.test(msg)) {
      // Treating similar to fullPageSession
      cachedArticleBundleSessionSupport = true
    } else if (/HTTP 404|Not Found/i.test(msg)) {
      cachedArticleBundleSessionSupport = false
    } else if (/无法|超时|fetch/i.test(msg)) {
      cachedArticleBundleSessionSupport = false
    } else {
      // Assume true if it's a validation error or something indicating the endpoint exists
      cachedArticleBundleSessionSupport = /INVALID_REQUEST|SESSION/i.test(msg)
    }
  }
  if (cachedArticleBundleSessionSupport !== null) {
    cachedArticleBundleSessionSupportAt = now
  }
  return cachedArticleBundleSessionSupport === true
}

export function resetArticleBundleSessionSupportCache(): void {
  cachedArticleBundleSessionSupport = null
  cachedArticleBundleSessionSupportAt = 0
}

export async function releaseArticleBundleSessionOnFailure(sessionId: string): Promise<void> {
  try {
    await articleBundleSessionAbort(sessionId)
  } catch {
    /* session may already be gone */
  }
}

export async function articleBundleSessionStart(body: {
  output: {
    markdownFilename: string
    targetFolderId?: string | null
    duplicatePolicy?: 'use_existing' | 'import_copy'
  }
  sourceMeta?: { pageUrl?: string; pageTitle?: string }
}): Promise<ArticleBundleSessionStartResult> {
  return apiRequest('/asset/articleBundleSession/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeoutMs: ARTICLE_BUNDLE_SESSION_START_TIMEOUT_MS
  })
}

export async function articleBundleSessionAppend(body: {
  sessionId: string
  filePath?: string
  fileDataUrl?: string
  relativePath: string
}): Promise<ArticleBundleSessionAppendResult> {
  return apiRequest('/asset/articleBundleSession/append', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeoutMs: ARTICLE_BUNDLE_SESSION_APPEND_TIMEOUT_MS
  })
}

export async function articleBundleSessionFinish(body: {
  sessionId: string
  options?: { deleteSessionFilesAfter?: boolean }
}): Promise<ArticleBundleSessionFinishResult> {
  return apiRequest('/asset/articleBundleSession/finish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeoutMs: ARTICLE_BUNDLE_SESSION_FINISH_TIMEOUT_MS
  })
}

export async function articleBundleSessionAbort(
  sessionId: string
): Promise<ArticleBundleSessionAbortResult> {
  return apiRequest(`/asset/articleBundleSession/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    timeoutMs: 15_000
  })
}
