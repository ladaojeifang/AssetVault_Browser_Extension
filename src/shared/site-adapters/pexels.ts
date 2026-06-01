import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const HOST_RE = /pexels\.com/i

const PEXELS_CDN_RE = /images\.pexels\.com/i

/**
 * Upgrade Pexels image URL to higher quality.
 * Removes auto-compress and size-limiting parameters.
 */
function maximizePexelsQuality(url: string): string {
  try {
    const u = new URL(url)

    // Remove compression parameter — use original quality
    u.searchParams.delete('auto')
    u.searchParams.delete('cs')

    // Remove size constraints
    u.searchParams.delete('w')
    u.searchParams.delete('h')
    u.searchParams.delete('fit')
    u.searchParams.delete('crop')
    u.searchParams.delete('sharp')
    u.searchParams.delete('dpr')

    return u.href
  } catch {
    return url
  }
}

/**
 * Try to build an original-size Pexels URL from any Pexels photo ID.
 * Pattern: https://images.pexels.com/photos/{id}/pexels-photo-{id}.jpeg?auto=compress...
 * -> https://images.pexels.com/photos/{id}/pexels-photo-{id}.jpeg
 */
function toOriginalPexelsUrl(id: number): string | null {
  if (!id || id <= 0) return null
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg`
}

function extractPhotoIdFromUrl(urlStr: string): number | null {
  try {
    const u = new URL(urlStr)
    // Match /photos/{id}/ pattern
    const match = u.pathname.match(/\/photos\/(\d+)\//)
    if (match) return Number(match[1])
  } catch { /* ignore */ }
  return null
}

function fromMetaTags(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const prop of ['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src']) {
    const content =
      document.querySelector(`meta[property="${prop}"]`)?.getAttribute('content') ||
      document.querySelector(`meta[name="${prop}"]`)?.getAttribute('content') ||
      ''
    if (!content) continue
    const abs = toAbsoluteUrl(content, pageUrl)
    if (!abs) continue

    // Try to get original-size version using photo ID
    const photoId = extractPhotoIdFromUrl(abs)
    const urlToUse = photoId ? (toOriginalPexelsUrl(photoId) || abs) : maximizePexelsQuality(abs)

    const cand = makeMediaCandidate({
      url: urlToUse,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.91,
      site: 'pexels'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromPhotoDetails(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    '.photo-details__image img',
    '.img-bg img',
    '.photo-content img[src*="pexels.com"]',
    '.js-photo-zoom img',
    '.main-image img[src*="pexels.com"]',
    'figure img[src*="images.pexels.com"]',
  ]

  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(sel))) {
      const src = img.getAttribute('src') || img.currentSrc || img.dataset.src || ''
      if (!src || src.startsWith('data:')) continue

      // Skip thumbnails, avatars
      if (/thumbnail|avatar|tiny|small/i.test(src) && !/pexels\.com\/photos\//i.test(src)) continue
      if (img.width > 1 && img.width < 50) continue

      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue

      const photoId = extractPhotoIdFromUrl(abs)
      const urlToUse = photoId ? (toOriginalPexelsUrl(photoId) || abs) : maximizePexelsQuality(abs)

      const area = (img.naturalWidth || img.width) * (img.naturalHeight || img.height)
      const isLarge = area >= 80000
      const cand = makeMediaCandidate({
        url: urlToUse,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: isLarge ? 0.90 : 0.77,
        site: 'pexels'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromCdnImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const img of Array.from(document.querySelectorAll<HTMLImageElement>('img'))) {
    const src = img.getAttribute('src') || ''
    if (!PEXELS_CDN_RE.test(src)) continue

    if (img.width > 1 && img.width < 40) continue

    const abs = toAbsoluteUrl(src, pageUrl)
    if (!abs) continue

    const photoId = extractPhotoIdFromUrl(abs)
    const urlToUse = photoId ? (toOriginalPexelsUrl(photoId) || abs) : maximizePexelsQuality(abs)

    const cand = makeMediaCandidate({
      url: urlToUse,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.76,
      site: 'pexels'
    })
    if (cand) out.push(cand)
  }
  return out
}

export function resolvePexelsCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  try {
    if (!HOST_RE.test(location.hostname)) return []
  } catch { return [] }

  return dedupeCandidates([
    ...fromMetaTags(pageUrl, pageTitle),
    ...fromPhotoDetails(pageUrl, pageTitle),
    ...fromCdnImages(pageUrl, pageTitle),
  ])
}
