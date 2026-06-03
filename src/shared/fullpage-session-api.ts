import { apiRequest, pingApp } from './api'
import {
  classifyFullPageSessionProbeError,
  FULLPAGE_STRIP_JPEG_QUALITY
} from './fullpage-session-paths'
import type {
  FullPageSessionAbortResult,
  FullPageSessionAppendResult,
  FullPageSessionFinishResult,
  FullPageSessionStartResult
} from './fullpage-session-types'

export {
  classifyFullPageSessionProbeError,
  FULLPAGE_STRIP_JPEG_QUALITY,
  fullPageInspectSessionId,
  fullPageStripFileName,
  mapFullPageFinishWarnings
} from './fullpage-session-paths'

export const FULLPAGE_SESSION_APPEND_TIMEOUT_MS = 120_000
export const FULLPAGE_SESSION_FINISH_TIMEOUT_MS = 180_000
export const FULLPAGE_SESSION_START_TIMEOUT_MS = 15_000

let cachedFullPageSessionSupport: boolean | null = null
let cachedFullPageSessionSupportAt = 0
const FULLPAGE_SESSION_SUPPORT_CACHE_MS = 5 * 60 * 1000

/**
 * Pro exposes fullPageSession when GET /asset/fullPageSession/{id} returns session-not-found.
 */
export async function supportsFullPageSessionApi(): Promise<boolean> {
  const now = Date.now()
  if (
    cachedFullPageSessionSupport !== null &&
    now - cachedFullPageSessionSupportAt < FULLPAGE_SESSION_SUPPORT_CACHE_MS
  ) {
    return cachedFullPageSessionSupport
  }
  try {
    await pingApp()
    await apiRequest('/asset/fullPageSession/fp___capability_probe___', {
      method: 'GET',
      timeoutMs: 8000
    })
    cachedFullPageSessionSupport = false
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/FULLPAGE_SESSION_NOT_FOUND|FULLPAGE_SESSION_EXPIRED/i.test(msg)) {
      cachedFullPageSessionSupport = true
    } else if (/HTTP 404|Not Found/i.test(msg)) {
      cachedFullPageSessionSupport = false
    } else if (/无法|超时|fetch/i.test(msg)) {
      cachedFullPageSessionSupport = false
    } else {
      const classified = classifyFullPageSessionProbeError(msg)
      if (classified === true) cachedFullPageSessionSupport = true
      else if (classified === false) cachedFullPageSessionSupport = false
    }
    // inconclusive (e.g. network blip): leave cache null so next capture re-probes
  }
  if (cachedFullPageSessionSupport !== null) {
    cachedFullPageSessionSupportAt = now
  }
  return cachedFullPageSessionSupport === true
}

export function resetFullPageSessionSupportCache(): void {
  cachedFullPageSessionSupport = null
  cachedFullPageSessionSupportAt = 0
}

export async function releaseFullPageSessionOnFailure(sessionId: string): Promise<void> {
  try {
    await fullPageSessionAbort(sessionId)
  } catch {
    /* session may already be gone */
  }
}

/** Retry once when Pro evicts stale sessions on the second start. */
export async function fullPageSessionStart(body: {
  layout: {
    widthPx: number
    contentHeightPx: number
    stripHeightsPx: number[]
    overlapPx: number
    devicePixelRatio?: number
  }
  output: {
    filename: string
    format: 'jpeg' | 'png'
    quality?: number
    targetFolderId?: string | null
    duplicatePolicy?: 'use_existing' | 'import_copy'
  }
  sourceMeta?: { pageUrl?: string; pageTitle?: string }
  options?: { sessionId?: string }
}): Promise<FullPageSessionStartResult> {
  return apiRequest('/asset/fullPageSession/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeoutMs: FULLPAGE_SESSION_START_TIMEOUT_MS
  })
}

export async function fullPageSessionAppend(body: {
  sessionId: string
  stripIndex: number
  stripHeightPx: number
  stripWidthPx?: number
  filePath?: string
  stripDataUrl?: string
}): Promise<FullPageSessionAppendResult> {
  return apiRequest('/asset/fullPageSession/append', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeoutMs: FULLPAGE_SESSION_APPEND_TIMEOUT_MS
  })
}

export async function fullPageSessionFinish(body: {
  sessionId: string
  layout?: { contentHeightPx?: number; overlapPx?: number }
  options?: { allowPartial?: boolean; deleteSessionFilesAfter?: boolean }
}): Promise<FullPageSessionFinishResult> {
  return apiRequest('/asset/fullPageSession/finish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeoutMs: FULLPAGE_SESSION_FINISH_TIMEOUT_MS
  })
}

export async function fullPageSessionAbort(
  sessionId: string
): Promise<FullPageSessionAbortResult> {
  return apiRequest(`/asset/fullPageSession/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    timeoutMs: 15_000
  })
}
