import { apiRequest, pingApp } from './api'
import type {
  ArticleBundleSessionAbortResult,
  ArticleBundleSessionAppendResult,
  ArticleBundleSessionFinishResult,
  ArticleBundleSessionStartResult
} from './article-bundle-session-types'

export const ARTICLE_BUNDLE_SESSION_APPEND_TIMEOUT_MS = 180_000
export const ARTICLE_BUNDLE_SESSION_FINISH_TIMEOUT_MS = 180_000
export const ARTICLE_BUNDLE_SESSION_START_TIMEOUT_MS = 15_000

let cachedArticleBundleSessionSupport: boolean | null = null
let cachedArticleBundleSessionSupportAt = 0
const ARTICLE_BUNDLE_SESSION_SUPPORT_CACHE_MS = 5 * 60 * 1000

/** Use app/info features — avoid GET probe that returns ARTICLE_BUNDLE_SESSION_NOT_FOUND in DevTools. */
export async function supportsArticleBundleSessionApi(): Promise<boolean> {
  const now = Date.now()
  if (
    cachedArticleBundleSessionSupport !== null &&
    now - cachedArticleBundleSessionSupportAt < ARTICLE_BUNDLE_SESSION_SUPPORT_CACHE_MS
  ) {
    return cachedArticleBundleSessionSupport
  }

  try {
    const app = await pingApp()
    if (Array.isArray(app.features)) {
      cachedArticleBundleSessionSupport = app.features.includes('articleBundleSession')
    } else {
      // Older Pro without features[] — fall back to session GET probe (404/NOT_FOUND means route exists).
      try {
        await apiRequest('/asset/articleBundleSession/ab___capability_probe___', {
          method: 'GET',
          timeoutMs: 8000
        })
        cachedArticleBundleSessionSupport = false
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        cachedArticleBundleSessionSupport =
          /ARTICLE_BUNDLE_SESSION_NOT_FOUND|ARTICLE_BUNDLE_SESSION_EXPIRED/i.test(msg)
      }
    }
  } catch {
    cachedArticleBundleSessionSupport = false
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
  if (!sessionId.startsWith('ab_')) return
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
  relativePath: string
  filePath?: string
  fileDataUrl?: string
  /** Pro downloads remote URL into session tempDir (same as importFromURL, with optional Referer). */
  sourceUrl?: string
  headers?: Record<string, string>
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
  requiredFiles: {
    markdown: string
    thumbnail: string
  }
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
