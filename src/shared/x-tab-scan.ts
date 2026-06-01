import type { CollectMeta } from './types'
import { buildXBatchCollectMeta } from './batch-image-variants'
import { fetchXStatusPhotos, isXPageUrl, parseXStatusUrl } from './x-syndication'
import type { HdImageResolvePayload } from './messages'
import { twitterMediaCandidateUrls } from './url-enlarger'
import { twitterMediaKey } from './x-media-urls'

export type XScanPageResult = {
  mediaKeys: string[]
  rawUrls: string[]
  pageUrl: string
  pageTitle: string
}

/** Inject standalone scanner (no ES module imports) and run in page. */
export async function scanXMediaInPage(tabId: number): Promise<XScanPageResult> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['injected-x-scan.js']
  })
  const injected = await chrome.scripting.executeScript({
    target: { tabId },
    func: async () => {
      const fn = (
        globalThis as {
          __assetVaultXScan?: () => Promise<{
            mediaKeys?: string[]
            rawUrls?: string[]
            urls?: string[]
            pageUrl: string
            pageTitle: string
          }>
        }
      ).__assetVaultXScan
      if (typeof fn !== 'function') {
        return {
          mediaKeys: [] as string[],
          rawUrls: [] as string[],
          pageUrl: location.href,
          pageTitle: document.title
        }
      }
      try {
        return await fn()
      } catch {
        return {
          mediaKeys: [] as string[],
          rawUrls: [] as string[],
          pageUrl: location.href,
          pageTitle: document.title
        }
      }
    }
  })
  const row = injected[0]?.result
  const legacyUrls = row?.urls ?? []
  return {
    mediaKeys: row?.mediaKeys ?? [],
    rawUrls: row?.rawUrls ?? legacyUrls,
    pageUrl: row?.pageUrl ?? '',
    pageTitle: row?.pageTitle ?? ''
  }
}

/** Primary X image discovery: in-page scanner + extension API. Does not use content.js. */
export async function discoverXMediaForTab(
  tabId: number,
  pageUrl: string,
  pageTitle: string
): Promise<CollectMeta[]> {
  const mediaKeys = new Set<string>()
  const rawUrls: string[] = []

  try {
    const page = await scanXMediaInPage(tabId)
    for (const k of page.mediaKeys) mediaKeys.add(k)
    rawUrls.push(...page.rawUrls)
  } catch (e) {
    console.warn('[AssetVault] scanXMediaInPage failed', e)
  }

  let apiPhotos: Awaited<ReturnType<typeof fetchXStatusPhotos>> = []
  if (parseXStatusUrl(pageUrl)) {
    try {
      apiPhotos = await fetchXStatusPhotos(pageUrl)
      for (const p of apiPhotos) mediaKeys.add(p.mediaKey)
    } catch (e) {
      console.warn('[AssetVault] fetchXStatusPhotos failed', e)
    }
  }

  return buildXBatchCollectMeta({
    mediaKeys,
    rawUrls,
    apiPhotos,
    pageUrl,
    pageTitle
  })
}

export function hdPayloadFromXUrls(
  urls: string[],
  pageUrl: string,
  pageTitle: string
): HdImageResolvePayload {
  const seen = new Set<string>()
  const candidates: HdImageResolvePayload['candidates'] = []
  for (const raw of urls) {
    for (const url of twitterMediaCandidateUrls(raw)) {
      if (!url || seen.has(url)) continue
      seen.add(url)
      candidates.push({ url, source: 'twitter-resolve' })
    }
  }
  return {
    candidates,
    referer: pageUrl,
    pageUrl,
    pageTitle
  }
}

export { isXPageUrl }
