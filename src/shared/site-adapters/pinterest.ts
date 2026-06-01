import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

/** Known Pinterest image sizes from smallest to largest */
const PINIMG_SIZES = ['236x', '474x', '564x', '736x']

function enlargeToOriginal(url: string): string {
  for (const size of PINIMG_SIZES) {
    if (url.includes(`/${size}/`)) {
      return url.replace(`/${size}/`, '/originals/')
    }
  }
  return url
}

function fromOgImage(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const content = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || ''
  const abs = toAbsoluteUrl(content, pageUrl)
  if (!abs) return out
  // Enlarge to original size
  const hdUrl = enlargeToOriginal(abs)
  const cand = makeMediaCandidate({
    url: hdUrl,
    pageUrl,
    pageTitle,
    referer: pageUrl,
    confidence: 0.88,
    site: 'pinterest'
  })
  if (cand) out.push(cand)
  return out
}

function fromInitialData(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const s of Array.from(document.querySelectorAll<HTMLImageElement>('script[type="application/json"]'))) {
    const txt = s.textContent || ''
    let data: unknown
    try {
      data = JSON.parse(txt)
    } catch {
      continue
    }
    // __initialData may be nested or direct
    const initialData = (data as Record<string, unknown>)?.__initialData ?? data
    if (!initialData || typeof initialData !== 'object') continue

    const str = JSON.stringify(initialData)
    // Extract pinimg.com URLs
    const re = /https?:\/\/i\.pinimg\.com\/[^\s"'\\]+?\.(?:jpg|jpeg|png|gif|webp)(\?[^\s"'\\]*)?/gi
    const hits = str.match(re) || []

    // Deduplicate and pick best size per ID
    const seenIds = new Set<string>()
    for (const hit of hits) {
      // Extract ID portion for dedup
      const idMatch = hit.match(/([a-f0-9]{8,})[./]/i)
      if (!idMatch) continue
      const id = idMatch[1]
      if (seenIds.has(id)) continue
      // Prefer originals
      const enlarged = enlargeToOriginal(hit)
      const abs = toAbsoluteUrl(enlarged, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: hit.includes('/originals/') ? 0.9 : 0.82,
        site: 'pinterest'
      })
      if (cand) {
        out.push(cand)
        seenIds.add(id)
      }
    }

    // Check for video URLs in pin data
    const videoRe = /https?:\/\/v1\.pinimg\.com\/videos\/[^\s"'\\]+?\.mp4(\?[^\s"'\\]*)?/gi
    const videoHits = str.match(videoRe) || []
    for (const vhit of videoHits) {
      const abs = toAbsoluteUrl(vhit, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.85,
        site: 'pinterest'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromDomImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const img of Array.from(document.querySelectorAll<HTMLImageElement>('img[src*="i.pinimg.com"]'))) {
    const src = img.getAttribute('src') || ''
    if (!src) continue
    const abs = toAbsoluteUrl(src, pageUrl)
    if (!abs) continue
    const hdUrl = enlargeToOriginal(abs)
    const cand = makeMediaCandidate({
      url: hdUrl,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.72,
      site: 'pinterest'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromVideoElements(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const video of Array.from(document.querySelectorAll<HTMLVideoElement>('video'))) {
    for (const src of [video.currentSrc, video.src]) {
      const abs = toAbsoluteUrl(src || '', pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        duration: Number.isFinite(video.duration) ? video.duration : undefined,
        confidence: 0.84,
        site: 'pinterest'
      })
      if (cand) out.push(cand)
    }
    // Also check source children
    for (const source of Array.from(video.querySelectorAll('source'))) {
      const src = source.getAttribute('src') || ''
      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.82,
        site: 'pinterest'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

export function resolvePinterestCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  if (
    !/pinterest\.com$|pinterest\.[a-z]{2}$|pin\.it/i.test(location.hostname)
  ) {
    return []
  }
  return dedupeCandidates([
    ...fromOgImage(pageUrl, pageTitle),
    ...fromInitialData(pageUrl, pageTitle),
    ...fromDomImages(pageUrl, pageTitle),
    ...fromVideoElements(pageUrl, pageTitle)
  ])
}
