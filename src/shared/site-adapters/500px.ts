import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const HOST_RE = /500px\.com/i

const PX_CDN_RE = /drscdn\.500px\.com|cdn\.500px\.org|[^/]*500px/i

/**
 * Try to get the highest quality version of a 500px photo URL.
 * Appends quality parameter or removes size restrictions.
 */
function maximizePxQuality(url: string): string {
  try {
    const u = new URL(url)

    // Ensure high quality
    if (!u.searchParams.get('q')) {
      u.searchParams.set('q', '85')
    } else if (Number(u.searchParams.get('q')) < 85) {
      u.searchParams.set('q', '85')
    }

    // Remove size constraints that may downscale
    u.searchParams.delete('w')
    u.searchParams.delete('h')
    u.searchParams.delete('crop')
    u.searchParams.delete('fit')
    u.searchParams.delete('maxwidth')
    u.searchParams.delete('maxheight')
    u.searchParams.delete('size')

    // For CDN paths, prefer full resolution path segments
    const path = u.pathname
    if (/\/\d+\/[a-f0-9]{8}\/[\w-]+-\d+/.test(path)) {
      // Already a direct photo path, keep as-is
    }

    return u.href
  } catch {
    return url
  }
}

function fromMetaTags(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const prop of ['og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image']) {
    const content =
      document.querySelector(`meta[property="${prop}"]`)?.getAttribute('content') ||
      document.querySelector(`meta[name="${prop}"]`)?.getAttribute('content') ||
      ''
    if (!content) continue
    const abs = toAbsoluteUrl(content, pageUrl)
    if (!abs) continue
    const maxed = maximizePxQuality(abs)
    const cand = makeMediaCandidate({
      url: maxed,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.93,
      site: '500px'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromPhotoContainers(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    '.photo-container img',
    '.photo img',
    '.photo-showcase img',
    '.main-photo img',
    'figure.photo img',
    '[class*="photo"] img[src*="500px"]',
    '[class*="photo"] img[src*="drscdn"]',
  ]

  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll(sel))) {
      const src = img.getAttribute('src') || img.currentSrc || img.dataset.src || ''
      if (!src || src.startsWith('data:')) continue

      // Skip user avatars and tiny UI elements
      if (/user_avatar|avatar.*jpg|profile-photo/i.test(src)) continue
      if (img.width > 1 && img.width < 50) continue

      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const maxed = maximizePxQuality(abs)

      const area = (img.naturalWidth || img.width) * (img.naturalHeight || img.height)
      const isLarge = area >= 64000 // roughly 253x253+
      const cand = makeMediaCandidate({
        url: maxed,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: isLarge ? 0.91 : 0.78,
        site: '500px'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromCdnImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const img of Array.from(document.querySelectorAll('img'))) {
    const src = img.getAttribute('src') || ''
    if (!PX_CDN_RE.test(src)) continue

    if (/avatar|profile.*photo/i.test(src)) continue
    if (img.width > 1 && img.width < 40) continue

    const abs = toAbsoluteUrl(src, pageUrl)
    if (!abs) continue
    const maxed = maximizePxQuality(abs)

    const cand = makeMediaCandidate({
      url: maxed,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.80,
      site: '500px'
    })
    if (cand) out.push(cand)
  }
  return out
}

export function resolve500pxCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  try {
    if (!HOST_RE.test(location.hostname)) return []
  } catch { return [] }

  return dedupeCandidates([
    ...fromMetaTags(pageUrl, pageTitle),
    ...fromPhotoContainers(pageUrl, pageTitle),
    ...fromCdnImages(pageUrl, pageTitle),
  ])
}
