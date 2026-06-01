import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const HOST_RE = /freepik\.com/i

const FREEPIK_CDN_RE = /img\.freepik\.com/i

/**
 * Clean up Freepik preview URL.
 * Freepik CDN URLs often have size parameters we can optimize.
 */
function maximizeFreepikQuality(url: string): string {
  try {
    const u = new URL(url)

    // Remove size constraints to get best available version
    u.searchParams.delete('w')
    u.searchParams.delete('h')
    u.searchParams.delete('size')
    u.searchParams.delete('quality')

    return u.href
  } catch {
    return url
  }
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
    const maxed = maximizeFreepikQuality(abs)
    const cand = makeMediaCandidate({
      url: maxed,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.89,
      site: 'freepik'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromShowcaseImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    '.showcase img',
    '.asset-img img',
    '.preview img[src*="freepik.com"]',
    '.resource-preview img',
    '.item-thumbnail img[src*="freepik.com"]',
    '[class*="asset"] img[src*="img.freepik.com"]',
    '.card-image img[src*="freepik"]',
    '.detail-preview img[src*="freepik.com"]',
    '.free-resource img[src*="freepik.com"]',
  ]

  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll(sel))) {
      const src = img.getAttribute('src') || img.currentSrc || img.dataset.src || ''
      if (!src || src.startsWith('data:')) continue

      // Skip logos, icons, tiny UI elements
      if (/\/(?:logo|icon|badge|avatar|flag)\//i.test(src)) continue
      if (img.width > 1 && img.width < 45) continue

      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const maxed = maximizeFreepikQuality(abs)

      const area = (img.naturalWidth || img.width) * (img.naturalHeight || img.height)
      const isLarge = area >= 90000 // ~300x300+

      // Free resource pages tend to have better previews
      const isFreeResource = /\/free-|\/premium-free\//i.test(pageUrl)

      const cand = makeMediaCandidate({
        url: maxed,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: isFreeResource
          ? (isLarge ? 0.90 : 0.84)
          : (isLarge ? 0.88 : 0.76),
        site: 'freepik'
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
    if (!FREEPIK_CDN_RE.test(src)) continue

    if (/\/(?:logo|icon|avatar|badge)\//i.test(src)) continue
    if (img.width > 1 && img.width < 35) continue

    const abs = toAbsoluteUrl(src, pageUrl)
    if (!abs) continue
    const maxed = maximizeFreepikQuality(abs)

    const cand = makeMediaCandidate({
      url: maxed,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.78,
      site: 'freepik'
    })
    if (cand) out.push(cand)
  }
  return out
}

export function resolveFreepikCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  try {
    if (!HOST_RE.test(location.hostname)) return []
  } catch { return [] }

  return dedupeCandidates([
    ...fromMetaTags(pageUrl, pageTitle),
    ...fromShowcaseImages(pageUrl, pageTitle),
    ...fromCdnImages(pageUrl, pageTitle),
  ])
}
