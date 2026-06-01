import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const HOST_RE = /unsplash\.com/i

const UNSPLASH_CDN_RE = /images\.unsplash\.com/i

/**
 * Upgrade Unsplash CDN URL to higher quality.
 * Unsplash uses query parameters like w=1080, q=80, auto=format.
 * We want to remove size limits and boost quality.
 */
function maximizeUnsplashQuality(url: string): string {
  try {
    const u = new URL(url)

    // Boost quality to 85
    const currentQ = Number(u.searchParams.get('q') || '80')
    if (currentQ < 85) {
      u.searchParams.set('q', '85')
    }

    // Remove width/height constraints for full size
    u.searchParams.delete('w')
    u.searchParams.delete('h')
    u.searchParams.delete('fit')
    u.searchParams.delete('crop')
    u.searchParams.delete('fm') // Don't force format conversion

    // Keep auto=compress as it helps delivery, but ensure no size cap

    return u.href
  } catch {
    return url
  }
}

/**
 * Extract photo ID from Unsplash URL patterns like:
 * /photos/{slug}-{id}/...
 * Returns the numeric ID portion.
 */
function extractUnsplashPhotoId(urlStr: string): string | null {
  try {
    const u = new URL(urlStr)
    // Match /photos/some-slug-{ID}/ or /photo/{ID}/
    const match = u.pathname.match(/\/photos\/[\w-]+-(\d{10,})/) || u.pathname.match(/\/photos\/(\d{10,})/)
    if (match) return match[1]
  } catch { /* ignore */ }
  return null
}

function fromMetaTags(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const prop of ['og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src']) {
    const content =
      document.querySelector(`meta[property="${prop}"]`)?.getAttribute('content') ||
      document.querySelector(`meta[name="${prop}"]`)?.getAttribute('content') ||
      ''
    if (!content) continue
    const abs = toAbsoluteUrl(content, pageUrl)
    if (!abs) continue
    const maxed = maximizeUnsplashQuality(abs)
    const cand = makeMediaCandidate({
      url: maxed,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.92,
      site: 'unsplash'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromPhotoShowcase(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    '.photo-show-img img',
    '._2gj-6s img',
    '[class*="photo-show"] img',
    '.fullscreen-hero img[src*="unsplash.com"]',
    '.main-photo img[src*="unsplash.com"]',
    '[data-test="photo-detail-image"] img',
    'article[data-id] img[src*="images.unsplash.com"]',
  ]

  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(sel))) {
      const src = img.getAttribute('src') || img.currentSrc || img.dataset.src || ''
      if (!src || src.startsWith('data:')) continue

      // Skip avatars and profile images
      if (/profile|avatar|user/i.test(src) && !/unsplash\.com\/photos\//i.test(src)) continue
      if (img.width > 1 && img.width < 50) continue

      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const maxed = maximizeUnsplashQuality(abs)

      const area = (img.naturalWidth || img.width) * (img.naturalHeight || img.height)
      const isLarge = area >= 100000 // ~316x316+

      const cand = makeMediaCandidate({
        url: maxed,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: isLarge ? 0.92 : 0.78,
        site: 'unsplash'
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
    if (!UNSPLASH_CDN_RE.test(src)) continue

    if (/avatar|profile/i.test(src)) continue
    if (img.width > 1 && img.width < 40) continue

    const abs = toAbsoluteUrl(src, pageUrl)
    if (!abs) continue
    const maxed = maximizeUnsplashQuality(abs)

    const cand = makeMediaCandidate({
      url: maxed,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.81,
      site: 'unsplash'
    })
    if (cand) out.push(cand)
  }
  return out
}

export function resolveUnsplashCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  try {
    if (!HOST_RE.test(location.hostname)) return []
  } catch { return [] }

  return dedupeCandidates([
    ...fromMetaTags(pageUrl, pageTitle),
    ...fromPhotoShowcase(pageUrl, pageTitle),
    ...fromCdnImages(pageUrl, pageTitle),
  ])
}
