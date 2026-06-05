import { articleBundleSessionAppend } from '../shared/article-bundle-session-api'
import { fetchRemoteBody } from '../shared/api'
import { bypassFetch } from '../shared/bypass-fetch'
import { hasBroadHostAccess, originPatternFromUrl } from '../shared/host-permissions'
import {
  isAcceptableArticleImageBlob,
  isHotlinkPlaceholderBlob,
} from './image-blob-validate'
import { fetchBlobInTab } from './page-markdown-tab-bridge'

function isOldProMissingApi(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return (
    /^INVALID_REQUEST/i.test(msg) &&
    !/DOWNLOAD_|HOTLINK|ARTICLE_BUNDLE_/i.test(msg)
  )
}

function isProFetchRouteMissing(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /HTTP 404|NOT_FOUND|fetchRemoteBody/i.test(msg)
}

/** Pro downloads with Referer (same path as batch collect). */
export async function appendBundleImageViaProSourceUrl(
  sessionId: string,
  relativePath: string,
  sourceUrl: string,
  referer: string,
): Promise<void> {
  await articleBundleSessionAppend({
    sessionId,
    relativePath,
    sourceUrl,
    headers: referer ? { Referer: referer } : undefined,
  })
}

async function appendBundleImageViaProFetchBody(
  sessionId: string,
  relativePath: string,
  sourceUrl: string,
  referer: string,
): Promise<void> {
  const { dataUrl } = await fetchRemoteBody({
    url: sourceUrl,
    headers: referer ? { Referer: referer } : undefined,
  })
  await articleBundleSessionAppend({
    sessionId,
    relativePath,
    fileDataUrl: dataUrl,
  })
}

export async function ensureHostPermissionsForMediaUrls(
  pageUrl: string,
  mediaUrls: string[],
): Promise<void> {
  if (await hasBroadHostAccess()) return
  const patterns = new Set<string>()
  for (const raw of [pageUrl, ...mediaUrls]) {
    const pattern = originPatternFromUrl(raw)
    if (pattern) patterns.add(pattern)
  }
  for (const pattern of patterns) {
    if (await chrome.permissions.contains({ origins: [pattern] })) continue
    try {
      await chrome.permissions.request({ origins: [pattern] })
    } catch {
      /* user dismissed or policy blocked */
    }
  }
}

/** Extension-side fallback when Pro download is unavailable or fails. */
export async function downloadMediaFallback(
  tabId: number,
  url: string,
  referer: string,
  signal: AbortSignal,
): Promise<Blob> {
  if (signal.aborted) throw new Error('aborted')

  try {
    const res = await bypassFetch(url, { referer, signal, maxRetries: 2 })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    if (blob.size === 0) throw new Error('empty body')
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('text/html') && blob.size < 64 * 1024) {
      throw new Error('response is HTML, not image')
    }
    return blob
  } catch (bypassErr) {
    try {
      const headers: Record<string, string> = referer ? { Referer: referer } : {}
      const res = await fetch(url, {
        signal,
        headers,
        referrer: referer,
        referrerPolicy: referer ? 'unsafe-url' : 'strict-origin-when-cross-origin',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      if (blob.size === 0) throw new Error('empty body')
      return blob
    } catch {
      const hint = bypassErr instanceof Error ? bypassErr.message : String(bypassErr)
      return fetchBlobInTab(tabId, url, { referer }).catch((tabErr) => {
        const tabHint = tabErr instanceof Error ? tabErr.message : String(tabErr)
        throw new Error(`${hint}; ${tabHint}`)
      })
    }
  }
}

export type BundleImageDownloadResult = { via: 'pro' } | { via: 'blob'; blob: Blob }

export type ProDownloadCapabilities = {
  proSourceUrlEnabled: boolean
  proFetchBodyEnabled: boolean
}

export async function downloadBundleImage(
  args: {
    sessionId: string
    relativePath: string
    sourceUrl: string
    referer: string
    tabId: number
    signal: AbortSignal
  },
  caps: ProDownloadCapabilities,
): Promise<{ result: BundleImageDownloadResult; caps: ProDownloadCapabilities }> {
  let { proSourceUrlEnabled, proFetchBodyEnabled } = caps

  if (proSourceUrlEnabled) {
    try {
      await appendBundleImageViaProSourceUrl(
        args.sessionId,
        args.relativePath,
        args.sourceUrl,
        args.referer,
      )
      return { result: { via: 'pro' }, caps: { proSourceUrlEnabled, proFetchBodyEnabled } }
    } catch (e) {
      if (isOldProMissingApi(e)) proSourceUrlEnabled = false
      else if (/ARTICLE_BUNDLE_|LIBRARY_NOT/i.test(e instanceof Error ? e.message : String(e))) throw e
    }
  }

  if (proFetchBodyEnabled) {
    try {
      await appendBundleImageViaProFetchBody(
        args.sessionId,
        args.relativePath,
        args.sourceUrl,
        args.referer,
      )
      return { result: { via: 'pro' }, caps: { proSourceUrlEnabled, proFetchBodyEnabled } }
    } catch (e) {
      if (isProFetchRouteMissing(e) || isOldProMissingApi(e)) proFetchBodyEnabled = false
      else if (/ARTICLE_BUNDLE_|LIBRARY_NOT/i.test(e instanceof Error ? e.message : String(e))) throw e
    }
  }

  let blob = await downloadMediaFallback(args.tabId, args.sourceUrl, args.referer, args.signal)
  const placeholder =
    (await isHotlinkPlaceholderBlob(blob, args.sourceUrl)) ||
    !(await isAcceptableArticleImageBlob(blob))

  if (placeholder && proFetchBodyEnabled) {
    try {
      await appendBundleImageViaProFetchBody(
        args.sessionId,
        args.relativePath,
        args.sourceUrl,
        args.referer,
      )
      return { result: { via: 'pro' }, caps: { proSourceUrlEnabled, proFetchBodyEnabled } }
    } catch (e) {
      if (isProFetchRouteMissing(e)) proFetchBodyEnabled = false
      else if (!/ARTICLE_BUNDLE_|LIBRARY_NOT/i.test(e instanceof Error ? e.message : String(e))) {
        /* keep blob error below */
      }
    }
  }

  if (placeholder) {
    if (proFetchBodyEnabled === false && proSourceUrlEnabled === false) {
      throw new Error(
        'downloaded image too small or invalid (防盗链占位图；请更新并重启 AssetVault Pro)',
      )
    }
    throw new Error('downloaded image too small or invalid')
  }

  return {
    result: { via: 'blob', blob },
    caps: { proSourceUrlEnabled, proFetchBodyEnabled },
  }
}
