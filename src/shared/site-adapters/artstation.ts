import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const HOST_RE = /artstation\.com/i

const ARTSTATION_CDN_RE = /cdn[ab]\.artstation\.com/i

/** Size suffixes from smallest to largest */
const SIZE_SUFFIXES = ['_micro_square', '_small_square', '_smaller_square', '_small', '_medium', '_large', '_4k']

/**
 * Try to get the largest version of an ArtStation asset URL.
 * Replaces smaller size suffixes with larger ones.
 * If URL already has _large or _4k, returns it as-is.
 */
function maximizeArtstationSize(url: string): string {
  for (let i = 0; i < SIZE_SUFFIXES.length - 1; i++) {
    if (url.includes(SIZE_SUFFIXES[i])) {
      return url.replace(SIZE_SUFFIXES[i], '_4k')
    }
  }
  // Already at largest or no known suffix
  if (url.includes('_4k')) return url
  if (url.includes('_large')) return url.replace('_large', '_4k')
  return url
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
    const maxed = maximizeArtstationSize(abs)
    const cand = makeMediaCandidate({
      url: maxed,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.88,
      site: 'artstation'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromJsonLd(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const el of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    let data: unknown
    try {
      data = JSON.parse(el.textContent || '')
    } catch { continue }

    const items = Array.isArray(data) ? data : [data]
    for (const item of items) {
      if (typeof item !== 'object' || !item) continue
      const obj = item as Record<string, unknown>

      const img = obj.image
      if (typeof img === 'string') {
        const abs = toAbsoluteUrl(img, pageUrl)
        if (abs) {
          const maxed = maximizeArtstationSize(abs)
          const cand = makeMediaCandidate({
            url: maxed,
            pageUrl,
            pageTitle,
            referer: pageUrl,
            confidence: 0.86,
            site: 'artstation'
          })
          if (cand) out.push(cand)
        }
      } else if (Array.isArray(img)) {
        for (const i of img) {
          const imgUrl = typeof i === 'string' ? i : (i && typeof i === 'object' ? ((i as Record<string, unknown>).url as string) || '' : '')
          if (!imgUrl) continue
          const abs = toAbsoluteUrl(imgUrl, pageUrl)
          if (abs) {
            const maxed = maximizeArtstationSize(abs)
            const cand = makeMediaCandidate({
              url: maxed,
              pageUrl,
              pageTitle,
              referer: pageUrl,
              confidence: 0.84,
              site: 'artstation'
            })
            if (cand) out.push(cand)
          }
        }
      }
    }
  }
  return out
}

function fromAssetMetaImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // ArtStation project pages contain assets in specific containers
  const selectors = [
    '.asset-meta img',
    '[class*="asset"] img[src*="artstation.com"]',
    '.project-asset img',
    '.artwork-image img'
  ]

  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll(sel))) {
      const src = img.getAttribute('src') || img.dataset.src || ''
      if (!src) continue
      // Skip avatars and UI icons
      if (src.includes('/user/') && src.includes('/avatar')) continue
      if (img.width > 1 && img.width < 50) continue // skip tiny elements

      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const maxed = maximizeArtstationSize(abs)

      // Determine confidence based on element size
      const isLarge = img.width >= 200
      const cand = makeMediaCandidate({
        url: maxed,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: isLarge ? 0.91 : 0.76,
        site: 'artstation'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromCdnImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // Catch all ArtStation CDN images on the page
  for (const img of Array.from(document.querySelectorAll('img'))) {
    const src = img.getAttribute('src') || ''
    if (!ARTSTATION_CDN_RE.test(src)) continue
    // Skip small UI elements
    if (src.includes('/avatar') || src.includes('/logo') || src.includes('/icon')) continue
    if (img.width > 1 && img.width < 40) continue

    const abs = toAbsoluteUrl(src, pageUrl)
    if (!abs) continue
    const maxed = maximizeArtstationSize(abs)

    const cand = makeMediaCandidate({
      url: maxed,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.74,
      site: 'artstation'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromEmbeddedAssets(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // ArtStation may embed asset list in __INITIAL_STATE__ or similar
  for (const s of Array.from(document.querySelectorAll('script'))) {
    const txt = s.textContent || ''
    if (!txt.includes('assets') && !txt.includes('artstation.com/assets')) continue

    // Look for cdn artstation URLs with image extensions
    const re = /https?:\/\/cdn[ab]\.artstation\.com\/assets\/[^\s"'\\<>]+?\.(?:jpg|jpeg|png|gif|webp)(\?[^\s"'\\<>]*)?/gi
    const hits = txt.match(re) || []
    const seen = new Set<string>()

    for (const hit of hits) {
      if (hit.includes('/avatar')) continue
      if (seen.has(hit)) continue
      seen.add(hit)

      const abs = toAbsoluteUrl(hit, pageUrl)
      if (!abs) continue
      const maxed = maximizeArtstationSize(abs)
      const cand = makeMediaCandidate({
        url: maxed,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.82,
        site: 'artstation'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

export function resolveArtstationCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  try {
    if (!HOST_RE.test(location.hostname)) return []
  } catch { return [] }

  return dedupeCandidates([
    ...fromOgImage(pageUrl, pageTitle),
    ...fromJsonLd(pageUrl, pageTitle),
    ...fromAssetMetaImages(pageUrl, pageTitle),
    ...fromCdnImages(pageUrl, pageTitle),
    ...fromEmbeddedAssets(pageUrl, pageTitle),
  ])
}
