/**
 * Image URLs taken from purified main-column HTML — aligns with Turndown output.
 */

import {
  collectImageUrlsFromImg,
  isArticleImageUrl,
  pickBestImageUrl,
  resolveBestImageUrlFromImg,
} from '../../shared/image-url-resolve'
import { enlargeImageUrl } from '../../shared/url-enlarger'
import { canonicalImagePath } from './main-column-url-match'
import { getExtensionFromUrl, type MediaItem } from './media-inventory'

/** Build download rows from article HTML (same source Turndown uses for ![...](url)). */
export async function collectImageMediaFromContentHtml(
  contentHtml: string,
  pageUrl: string,
): Promise<MediaItem[]> {
  const doc = new DOMParser().parseFromString(contentHtml, 'text/html')
  const byPath = new Map<string, { preview: string; urls: Set<string> }>()

  doc.querySelectorAll('img').forEach((img) => {
    const candidates = collectImageUrlsFromImg(img, pageUrl)
    const preview =
      pickBestImageUrl(candidates, pageUrl) ?? resolveBestImageUrlFromImg(img, pageUrl)
    if (!preview) return
    const key = canonicalImagePath(preview)
    let row = byPath.get(key)
    if (!row) {
      row = { preview, urls: new Set([preview]) }
      byPath.set(key, row)
    }
    for (const u of candidates) {
      if (isArticleImageUrl(u, pageUrl)) row.urls.add(u)
    }
  })

  const out: MediaItem[] = []
  for (const { preview, urls } of byPath.values()) {
    let highRes = preview
    try {
      const enlarged = await enlargeImageUrl(preview)
      if (enlarged && isArticleImageUrl(enlarged, pageUrl)) highRes = enlarged
    } catch {
      /* use preview */
    }
    urls.add(highRes)
    out.push({
      originalUrl: preview,
      replaceUrls: [...urls],
      highResUrl: pickBestImageUrl(urls, pageUrl) ?? highRes,
      tagName: 'IMG',
      type: 'image',
      extension: getExtensionFromUrl(highRes, 'jpg'),
    })
  }
  return out
}
