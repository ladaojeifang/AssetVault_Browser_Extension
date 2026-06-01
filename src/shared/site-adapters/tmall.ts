import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const HOST_RE = /tmall\.com/i

const TMALL_CDN_RE = /gd[^.]*\.alicdn\.com|img[^.]*\.tmall\.com|img\.alicdn\.com/i

/** Enlarge Tmall product images by removing thumbnail suffixes */
function enlargeTmallUrl(url: string): string {
  let u = url
  u = u.replace(/_(sum|sq|b|q|60x60|120x120|220x220|240_240)\.(jpg|jpeg|png|webp|gif)/i, '.$2')
  u = u.replace(/_cx-\w+\./, '.')
  return u
}

function fromProductImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    '.tm-buyer-photo img',
    '#J_ImgBooth img',
    '.tm-main-img img',
    '.main-image img',
    '.image-wrapper img',
    '[class*="gallery"] img[class*="item"]'
  ]
  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll(sel))) {
      const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-ks-lazyload') || ''
      if (!src) continue
      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const hdUrl = enlargeTmallUrl(abs)
      const cand = makeMediaCandidate({
        url: hdUrl,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.89,
        site: 'tmall'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromDetailImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    '#J_DivItemDesc img',
    '.detail-content img',
    '[class*="desc"] img',
    '[class*="detail"] img',
    '.content img'
  ]
  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll(sel))) {
      const src = img.src || ''
      if (!src) continue
      if (img.naturalWidth && img.naturalWidth < 64) continue
      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.81,
        site: 'tmall'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromCdnImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const img of Array.from(document.querySelectorAll('img'))) {
    const src = img.src || ''
    if (!TMALL_CDN_RE.test(src)) continue
    if (src.includes('icon') || src.includes('logo') || src.includes('search') || src.includes('nav')) continue
    const abs = toAbsoluteUrl(src, pageUrl)
    if (!abs) continue
    const hdUrl = enlargeTmallUrl(abs)
    const cand = makeMediaCandidate({
      url: hdUrl,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.79,
      site: 'tmall'
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
  const cand = makeMediaCandidate({
    url: abs,
    pageUrl,
    pageTitle,
    referer: pageUrl,
    confidence: 0.86,
    site: 'tmall'
  })
  if (cand) out.push(cand)
  return out
}

export function resolveTmallCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  if (!HOST_RE.test(location.hostname)) return []

  return dedupeCandidates([
    ...fromOgImage(pageUrl, pageTitle),
    ...fromProductImages(pageUrl, pageTitle),
    ...fromDetailImages(pageUrl, pageTitle),
    ...fromCdnImages(pageUrl, pageTitle)
  ])
}
