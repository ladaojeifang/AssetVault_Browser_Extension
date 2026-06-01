import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const HOST_RE = /pixiv\.net|pixiv\.jp|www\.pixiv\.jp/i

const PIXIV_CDN_RE = /pximg\.net/i

/** Remove Pixiv thumbnail size prefix to get original image URL.
 *  e.g., /c/250x250_80/img-master/... → /img-original/...
 *       /img-master/..._master1200.jpg → /img-original/..._p0.jpg (best effort)
 */
function enlargePixivUrl(url: string): string {
  // Thumbnail format: /c/{size}_{quality}/img-master/...
  let u = url.replace(/\/c\/\d+x\d+_\d+\//g, '/img-original/')

  // Master format with size suffix: _master1200, _square1200 etc.
  // Try to convert master to original
  u = u.replace(/_master\d+/g, '')

  // Common thumbnail size patterns in pathname
  u = u.replace(/_(?:square|medium|small|thumb|mini|tiny)\d*\.(\w+)$/gi, '.$1')

  return u
}

function fromOgImage(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const prop of ['og:image', 'og:image:url', 'twitter:image']) {
    const content =
      document.querySelector(`meta[property="${prop}"]`)?.getAttribute('content') ||
      document.querySelector(`meta[name="${prop}"]`)?.getAttribute('content') ||
      ''
    if (!content) continue
    const abs = toAbsoluteUrl(content, pageUrl)
    if (!abs) continue
    const enlarged = enlargePixivUrl(abs)
    const cand = makeMediaCandidate({
      url: enlarged,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.90,
      site: 'pixiv'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromPreloadData(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // Pixiv embeds work metadata in meta[name="preload-data"] with base64-encoded content attribute
  const preloadMeta = document.querySelector('meta[name="preload-data"]')
  if (!preloadMeta) return out
  try {
    const raw = preloadMeta.getAttribute('content') || ''
    // Pixiv may use base64 encoding or direct JSON
    let jsonStr = raw
    if (/^[A-Za-z0-9+=\/]+$/.test(raw.trim())) {
      try {
        jsonStr = atob(raw.trim())
      } catch { /* not valid base64 */ }
    }

    let data: unknown
    try {
      data = JSON.parse(jsonStr)
    } catch { return out }

    const str = typeof data === 'object' ? JSON.stringify(data) : ''

    // Extract pximg.net URLs (Pixiv's CDN)
    const re = /https?:\/\/i\.pximg\.net[^\s"'\\<>]+?\.(?:jpg|jpeg|png|gif|webp)(\?[^\s"'\\<>]*)?/gi
    const hits = str.match(re) || []

    const seenUrls = new Set<string>()
    for (const hit of hits) {
      // Skip avatar/thumbnail-only paths
      if (hit.includes('/profile/') && hit.length < 80) continue
      if (hit.includes('/common/')) continue

      const abs = toAbsoluteUrl(hit, pageUrl)
      if (!abs || seenUrls.has(abs)) continue
      seenUrls.add(abs)

      const enlarged = enlargePixivUrl(abs)
      const isOriginal = !hit.includes('_master')
      const cand = makeMediaCandidate({
        url: enlarged,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: isOriginal ? 0.92 : 0.85,
        site: 'pixiv'
      })
      if (cand) out.push(cand)
    }
  } catch { /* ignore parse errors */ }
  return out
}

function fromDomImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []

  // Main artwork images in figure elements
  for (const fig of Array.from(document.querySelectorAll<HTMLImageElement>('figure img, [role="presentation"] img, .artwork img'))) {
    const src = fig.getAttribute('src') || fig.dataset.src || ''
    if (!src || !PIXIV_CDN_RE.test(src)) continue
    if (src.includes('/profile/') || src.includes('/common/') || src.includes('/icon/')) continue

    const abs = toAbsoluteUrl(src, pageUrl)
    if (!abs) continue

    const enlarged = enlargePixivUrl(abs)
    const cand = makeMediaCandidate({
      url: enlarged,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.88,
      site: 'pixiv'
    })
    if (cand) out.push(cand)
  }

  // Any other pximg.net images not already captured
  const seenInFigure = new Set(out.map(c => c.url.split('?')[0]))
  for (const img of Array.from(document.querySelectorAll<HTMLImageElement>('img[src*="pximg.net"]'))) {
    const src = img.getAttribute('src') || ''
    if (!src) continue
    if (src.includes('/profile/') || src.includes('/common/') || src.includes('/icon/')) continue

    const abs = toAbsoluteUrl(src, pageUrl)
    if (!abs) continue
    const key = abs.split('?')[0]
    if (seenInFigure.has(key)) continue

    const enlarged = enlargePixivUrl(abs)
    const cand = makeMediaCandidate({
      url: enlarged,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.75,
      site: 'pixiv'
    })
    if (cand) out.push(cand)
  }

  return out
}

function fromMangaPages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // Manga/multi-page works have a specific container structure
  const mangaContainer = document.querySelector('[class*="manga"], [class*="comic"], [class*="ugoira"]')
  if (!mangaContainer) {
    // Fallback: look for multiple large images that suggest a multi-page work
    const allImgs = document.querySelectorAll('img[src*="pximg.net"][src*="original"], img[data-src*="pximg.net"][data-src*="original"]')
    if (allImgs.length <= 1) return out
  }

  for (const img of Array.from(mangaContainer ? mangaContainer.querySelectorAll('img') : [])) {
    const src = img.getAttribute('src') || img.dataset.src || ''
    if (!src || !PIXIV_CDN_RE.test(src)) continue

    const abs = toAbsoluteUrl(src, pageUrl)
    if (!abs) continue

    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.91,
      site: 'pixiv'
    })
    if (cand) out.push(cand)
  }
  return out
}

export function resolvePixivCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  try {
    if (!HOST_RE.test(location.hostname)) return []
  } catch { return [] }

  return dedupeCandidates([
    ...fromOgImage(pageUrl, pageTitle),
    ...fromPreloadData(pageUrl, pageTitle),
    ...fromDomImages(pageUrl, pageTitle),
    ...fromMangaPages(pageUrl, pageTitle),
  ])
}
