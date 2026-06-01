import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const HOST_RE = /imgur\.com|i\.rr|imgur\.io/i

const IMGUR_CDN_RE = /i\.imgur\.com/i

/**
 * Clean up Imgur URL:
 * - Remove `?fb` and other tracking/query suffixes
 * - Normalize gifv -> gif when appropriate
 */
function cleanImgurUrl(url: string): string {
  try {
    const u = new URL(url)

    // Remove tracking params but keep format-relevant ones
    u.searchParams.delete('fb')
    u.searchParams.delete('fbclid')
    u.searchParams.delete('ref')
    u.searchParams.delete('r')

    return u.href
  } catch {
    return url
  }
}

/**
 * Convert .gifv extension to .gif for direct linking.
 */
function normalizeImgurExt(url: string): string {
  return url.replace(/\.gifv(\?|$)/, '.gif$1')
}

function fromMetaTags(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []

  // Video meta tag (for GIFs posted as video)
  const ogVideo =
    document.querySelector('meta[property="og:video"]')?.getAttribute('content') ||
    document.querySelector('meta[property="og:video:url"]')?.getAttribute('content') ||
    document.querySelector('meta[name="twitter:player:stream"]')?.getAttribute('content') ||
    ''
  if (ogVideo) {
    const abs = toAbsoluteUrl(normalizeImgurExt(cleanImgurUrl(ogVideo)), pageUrl)
    if (abs) {
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: /\.mp4/i.test(abs) ? 0.89 : 0.88,
        site: 'imgur'
      })
      if (cand) out.push(cand)
    }
  }

  // Image meta tag
  for (const prop of ['og:image', 'og:image:url', 'twitter:image']) {
    const content =
      document.querySelector(`meta[property="${prop}"]`)?.getAttribute('content') ||
      document.querySelector(`meta[name="${prop}"]`)?.getAttribute('content') ||
      ''
    if (!content) continue
    const cleaned = normalizeImgurExt(cleanImgurUrl(content))
    const abs = toAbsoluteUrl(cleaned, pageUrl)
    if (!abs) continue
    const isGif = /\.gif/i.test(abs)
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: isGif ? 0.88 : 0.90,
      site: 'imgur'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromPostImage(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    '.post-image img',
    '.image img',
    '[class*="post-media"] img',
    'figure img[src*="imgur.com"]',
    '.post-container img[src*="imgur"]',
  ]

  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(sel))) {
      const src = img.getAttribute('src') || img.currentSrc || ''
      if (!src || src.startsWith('data:')) continue

      const cleaned = normalizeImgurExt(cleanImgurUrl(src))
      const abs = toAbsoluteUrl(cleaned, pageUrl)
      if (!abs) continue

      const isGif = /\.gif/i.test(abs)
      const area = (img.naturalWidth || img.width) * (img.naturalHeight || img.height)
      const isLarge = area >= 40000

      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: isGif ? (isLarge ? 0.90 : 0.86) : (isLarge ? 0.91 : 0.80),
        site: 'imgur'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromAlbumImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = ['.album-images img', '.album-content img', '[class*="album"] img']

  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(sel))) {
      const src = img.getAttribute('src') || img.currentSrc || ''
      if (!src || src.startsWith('data:')) continue

      const cleaned = normalizeImgurExt(cleanImgurUrl(src))
      const abs = toAbsoluteUrl(cleaned, pageUrl)
      if (!abs) continue

      const isGif = /\.gif/i.test(abs)
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: isGif ? 0.87 : 0.88,
        site: 'imgur'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromGifPlayerVideos(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // Imgur renders GIFs as video elements with mp4 source
  const videoSelectors = ['.gif-player video', '.video-wrapper video', '.post-video video']

  for (const sel of videoSelectors) {
    for (const video of Array.from(document.querySelectorAll<HTMLVideoElement>(sel))) {
      // Check video element's own src
      for (const vSrc of [video.currentSrc, video.src]) {
        if (!vSrc) continue
        const abs = toAbsoluteUrl(vSrc, pageUrl)
        if (!abs) continue
        const cand = makeMediaCandidate({
          url: abs,
          pageUrl,
          pageTitle,
          referer: pageUrl,
          duration: Number.isFinite(video.duration) ? video.duration : undefined,
          confidence: 0.91,
          site: 'imgur'
        })
        if (cand) out.push(cand)
      }

      // Check source elements within video
      for (const source of Array.from(video.querySelectorAll('source'))) {
        const sSrc = source.getAttribute('src') || ''
        if (!sSrc) continue
        const abs = toAbsoluteUrl(sSrc, pageUrl)
        if (!abs) continue
        const cand = makeMediaCandidate({
          url: abs,
          pageUrl,
          pageTitle,
          referer: pageUrl,
          duration: Number.isFinite(video.duration) ? video.duration : undefined,
          confidence: 0.89,
          site: 'imgur'
        })
        if (cand) out.push(cand)
      }
    }
  }
  return out
}

function fromCdnDirectLinks(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const img of Array.from(document.querySelectorAll<HTMLImageElement>('img'))) {
    const src = img.getAttribute('src') || ''
    if (!IMGUR_CDN_RE.test(src)) continue
    if (img.width > 1 && img.width < 30) continue

    const cleaned = normalizeImgurExt(cleanImgurUrl(src))
    const abs = toAbsoluteUrl(cleaned, pageUrl)
    if (!abs) continue

    const isGif = /\.gif/i.test(abs)
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: isGif ? 0.86 : 0.84,
      site: 'imgur'
    })
    if (cand) out.push(cand)
  }
  return out
}

export function resolveImgurCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  try {
    if (!HOST_RE.test(location.hostname)) return []
  } catch { return [] }

  return dedupeCandidates([
    ...fromMetaTags(pageUrl, pageTitle),
    ...fromPostImage(pageUrl, pageTitle),
    ...fromAlbumImages(pageUrl, pageTitle),
    ...fromGifPlayerVideos(pageUrl, pageTitle),
    ...fromCdnDirectLinks(pageUrl, pageTitle),
  ])
}
