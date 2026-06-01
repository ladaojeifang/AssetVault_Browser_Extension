import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const HOST_RE = /designspiration\.com/i

const DS_CDN_RE = /ds-images\.dsccdn\.com|designspiration\.com.*\.(?:jpg|jpeg|png|webp|gif)/i

function fromMetaTags(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const prop of ['og:image', 'og:image:url', 'twitter:image', 'og:image:secure_url']) {
    const content =
      document.querySelector(`meta[property="${prop}"]`)?.getAttribute('content') ||
      document.querySelector(`meta[name="${prop}"]`)?.getAttribute('content') ||
      ''
    if (!content) continue
    const abs = toAbsoluteUrl(content, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.89,
      site: 'designspiration'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromSearchResultImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    '.search-result-image img',
    '.pin-img img',
    '.result-image img',
    '.ds-grid-item img',
    'article img[class*="result"]',
    'a[href*="/image/"] img',
    '[class*="masonry"] img',
    '[class*="pin"] img',
  ]

  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll(sel))) {
      const src = img.getAttribute('src') || img.currentSrc || img.dataset.src || ''
      if (!src || src.startsWith('data:')) continue

      // Skip very small elements (icons, UI decorations)
      if (img.width > 1 && img.width < 40) continue

      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue

      const area = (img.naturalWidth || img.width) * (img.naturalHeight || img.height)
      const isLarge = area >= 360000 // ~600x600+

      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: isLarge ? 0.89 : 0.76,
        site: 'designspiration'
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
    if (!DS_CDN_RE.test(src)) continue

    if (img.width > 1 && img.width < 35) continue

    const abs = toAbsoluteUrl(src, pageUrl)
    if (!abs) continue

    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.80,
      site: 'designspiration'
    })
    if (cand) out.push(cand)
  }
  return out
}

export function resolveDesignspirationCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  try {
    if (!HOST_RE.test(location.hostname)) return []
  } catch { return [] }

  return dedupeCandidates([
    ...fromMetaTags(pageUrl, pageTitle),
    ...fromSearchResultImages(pageUrl, pageTitle),
    ...fromCdnImages(pageUrl, pageTitle),
  ])
}
