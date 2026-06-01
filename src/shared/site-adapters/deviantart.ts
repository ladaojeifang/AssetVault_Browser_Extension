import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const HOST_RE = /deviantart\.com/i

const DA_CDN_RE = /(?:img|th00|origin|ff|pre)\.deviantart\.net/i

/** Known thumbnail size suffixes in DeviantArt CDN URLs */
const THUMB_SUFFIXES = [
  ',t_',
  ',150,',
  ',200h,',
  ',250,',
  ',300W,',
  ',350,',
  ',400w,',
]

/**
 * Attempt to upgrade a DeviantArt CDN URL to a larger version.
 * Removes common thumbnail size parameters and suffixes.
 */
function maximizeDaSize(url: string): string {
  let result = url

  // Remove known thumbnail suffixes
  for (const suffix of THUMB_SUFFIXES) {
    if (result.includes(suffix)) {
      result = result.replace(suffix, '')
    }
  }

  // Remove query params that limit size (e.g., ?width=...&height=...)
  try {
    const u = new URL(result)
    u.searchParams.delete('width')
    u.searchParams.delete('height')
    u.searchParams.delete('maxwidth')
    u.searchParams.delete('maxheight')
    result = u.href
  } catch {
    // ignore parse errors
  }

  return result
}

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
    const maxed = maximizeDaSize(abs)
    const cand = makeMediaCandidate({
      url: maxed,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.91,
      site: 'deviantart'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromDeviationImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    '.deviation-view img',
    '.art-stage img',
    '.deviation img[src*="deviantart.net"]',
    '[data-hook="deviation_image"] img',
    '.image-container img[src*="deviantart.net"]',
    '.dev-page-content img[src*="deviantart.net"]',
  ]

  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(sel))) {
      const src = img.getAttribute('src') || img.currentSrc || img.dataset.src || ''
      if (!src || src.startsWith('data:')) continue

      // Skip avatars, UI icons, badges
      if (/\/(avatar|icon|badge|logo)\//i.test(src)) continue
      if (img.width > 1 && img.width < 60 && img.height < 60) continue

      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const maxed = maximizeDaSize(abs)

      // Determine confidence by image size — larger images are more likely the main artwork
      const area = (img.naturalWidth || img.width) * (img.naturalHeight || img.height)
      const isMainArtwork = area >= 40000 // ~200x200 or larger
      const cand = makeMediaCandidate({
        url: maxed,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: isMainArtwork ? 0.92 : 0.74,
        site: 'deviantart'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromCdnImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const img of Array.from(document.querySelectorAll<HTMLImageElement>('img'))) {
    const src = img.getAttribute('src') || img.currentSrc || ''
    if (!DA_CDN_RE.test(src)) continue

    // Skip non-content images
    if (/\/(avatar|icon|badge|logo|symbol)\//i.test(src)) continue
    if (img.width > 1 && img.width < 40) continue

    const abs = toAbsoluteUrl(src, pageUrl)
    if (!abs) continue
    const maxed = maximizeDaSize(abs)

    const isThumb = /,(?:t_|150|200h)/i.test(src)
    const cand = makeMediaCandidate({
      url: maxed,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: isThumb ? 0.72 : 0.82,
      site: 'deviantart'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromJsonLd(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const el of Array.from(document.querySelectorAll<HTMLImageElement>('script[type="application/ld+json"]'))) {
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
        if (!abs) continue
        const maxed = maximizeDaSize(abs)
        const cand = makeMediaCandidate({
          url: maxed,
          pageUrl,
          pageTitle,
          referer: pageUrl,
          confidence: 0.88,
          site: 'deviantart'
        })
        if (cand) out.push(cand)
      } else if (Array.isArray(img)) {
        for (const i of img) {
          const imgUrl = typeof i === 'string' ? i : (i && typeof i === 'object' ? ((i as Record<string, unknown>).url as string) || '' : '')
          if (!imgUrl) continue
          const abs = toAbsoluteUrl(imgUrl, pageUrl)
          if (!abs) continue
          const maxed = maximizeDaSize(abs)
          const cand = makeMediaCandidate({
            url: maxed,
            pageUrl,
            pageTitle,
            referer: pageUrl,
            confidence: 0.85,
            site: 'deviantart'
          })
          if (cand) out.push(cand)
        }
      }
    }
  }
  return out
}

export function resolveDeviantartCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  try {
    if (!HOST_RE.test(location.hostname)) return []
  } catch { return [] }

  return dedupeCandidates([
    ...fromMetaTags(pageUrl, pageTitle),
    ...fromJsonLd(pageUrl, pageTitle),
    ...fromDeviationImages(pageUrl, pageTitle),
    ...fromCdnImages(pageUrl, pageTitle),
  ])
}
