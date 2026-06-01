import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const HOST_RE = /jd\.com|360buy\.com/i

/** JD CDN domains */
const JD_CDN_RE = /img.*\.360buyimg\.com|img.*\.jd\.com/i

/** Remove size-limiting suffixes like /n7/ to get original image */
function enlargeJdUrl(url: string): string {
  // JD uses path segments like /n0/, /n1/, ... /n7/ for different sizes
  // n0 = largest, n7 = smallest thumbnail
  let u = url
  const sizeMatch = u.match(/\/(n[0-9])\//)
  if (sizeMatch) {
    u = u.replace(/\/(n[0-9])\//, '/n0/')
  }
  // Also handle /s50x50_ style suffixes
  u = u.replace(/\/s\d+x\d+(_[a-z]+)?\//g, '/')
  return u
}

function fromProductMainImage(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = ['.spec-items img', '.jqzoom img', '.sku-photo img', '#spec-img img', '#preview img']
  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(sel))) {
      const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-imgsrc') || ''
      if (!src) continue
      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const hdUrl = enlargeJdUrl(abs)
      const cand = makeMediaCandidate({
        url: hdUrl,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.89,
        site: 'jd'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromDetailImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    '.detail-content img',
    '.ssd-module img',
    '#J-detail-content img',
    '.product-intro img',
    '[class*="detail"] img',
    '[class*="desc"] img'
  ]
  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(sel))) {
      const src = img.src || ''
      if (!src) continue
      // Skip tiny decorative images
      if (img.naturalWidth && img.naturalWidth < 80) continue
      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.82,
        site: 'jd'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromCdnImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const img of Array.from(document.querySelectorAll<HTMLImageElement>('img'))) {
    const src = img.src || ''
    if (!JD_CDN_RE.test(src)) continue
    if (src.includes('icon') || src.includes('logo') || src.includes('avatar')) continue
    const abs = toAbsoluteUrl(src, pageUrl)
    if (!abs) continue
    const hdUrl = enlargeJdUrl(abs)
    const cand = makeMediaCandidate({
      url: hdUrl,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.80,
      site: 'jd'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromOgImage(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const content =
    document.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
    document.querySelector('meta[name="og:image"]')?.getAttribute('content') ||
    ''
  if (!content) return out
  const abs = toAbsoluteUrl(content, pageUrl)
  if (!abs) return out
  const hdUrl = enlargeJdUrl(abs)
  const cand = makeMediaCandidate({
    url: hdUrl,
    pageUrl,
    pageTitle,
    referer: pageUrl,
    confidence: 0.86,
    site: 'jd'
  })
  if (cand) out.push(cand)
  return out
}

export function resolveJdCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  if (!HOST_RE.test(location.hostname)) return []

  return dedupeCandidates([
    ...fromOgImage(pageUrl, pageTitle),
    ...fromProductMainImage(pageUrl, pageTitle),
    ...fromDetailImages(pageUrl, pageTitle),
    ...fromCdnImages(pageUrl, pageTitle)
  ])
}
