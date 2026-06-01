/**
 * Unified batch scan: multi-source discovery + site-specific enrichments + preview/HD pairs.
 */

import { buildXBatchCollectMeta } from './batch-image-variants'
import {
  collectPageImageCandidates,
  imageCandidatesToCollectMeta
} from './page-image-scanner'
import { expandGenericBatchVariants } from './batch-image-variants'
import type { CollectMeta } from './types'
import { discoverTwitterMediaUrls, isXPageHost, twitterMediaKey } from './x-media-urls'
import { fetchXStatusPhotos, parseXStatusUrl } from './x-syndication'
import { runMatchingAdapters } from './site-adapters/index'

/** Full page scan for batch UI (preview + HD rows where applicable). */
export async function scanPageMediaFull(
  pageUrl: string,
  pageTitle: string
): Promise<CollectMeta[]> {
  const onX =
    typeof location !== 'undefined' && isXPageHost(location.hostname.toLowerCase())

  if (onX) {
    const mediaKeys = new Set<string>()
    const rawUrls: string[] = []

    const raw = collectPageImageCandidates(pageUrl, pageTitle)
    for (const c of raw) {
      const k = twitterMediaKey(c.url)
      if (k) mediaKeys.add(k)
      rawUrls.push(c.url)
    }

    for (const url of discoverTwitterMediaUrls(pageUrl)) {
      const k = twitterMediaKey(url)
      if (k) mediaKeys.add(k)
      rawUrls.push(url)
    }

    let apiPhotos: Awaited<ReturnType<typeof fetchXStatusPhotos>> = []
    if (parseXStatusUrl(pageUrl)) {
      try {
        apiPhotos = await fetchXStatusPhotos(pageUrl)
        for (const p of apiPhotos) mediaKeys.add(p.mediaKey)
      } catch {
        /* ignore */
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

  const candidates = collectPageImageCandidates(pageUrl, pageTitle)
  const base = imageCandidatesToCollectMeta(candidates, pageUrl, pageTitle)

  // ★ New: run matching site adapters for video/site-specific media candidates
  const adapterCandidates = runMatchingAdapters(pageUrl, pageTitle)
  const adapterMeta: CollectMeta[] = adapterCandidates.map((c) => ({
    url: c.url,
    filename: c.filename,
    pageUrl: c.pageUrl,
    pageTitle: c.pageTitle,
    width: undefined,
    height: undefined
  }))

  // Merge base image candidates + adapter media candidates (dedup by URL)
  const mergedBase = mergeCollectMetaDedup([...base, ...adapterMeta])

  const expanded = await expandGenericBatchVariants(mergedBase, pageUrl)
  return expanded.length ? expanded : mergedBase
}

/** Merge CollectMeta arrays, deduplicating by URL (first occurrence wins). */
function mergeCollectMetaDedup(items: CollectMeta[]): CollectMeta[] {
  const seen = new Set<string>()
  const result: CollectMeta[] = []
  for (const item of items) {
    if (!seen.has(item.url)) {
      seen.add(item.url)
      result.push(item)
    }
  }
  return result
}
