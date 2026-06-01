import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const HOST_RE = /mogujie\.com|mogu\.com/i

const MOGUJIE_CDN_RE = /(?:img|pic|image)[^.]*(?:mogujie|mogu|mgj)\.com|(?:mogujie|mogu|mgj)\.com[^"']*?\.(?:jpg|jpeg|png|webp)(?=\b)/i

/** Enlarge Mogujie images by removing size parameters */
function enlargeMogujieUrl(url: string): string {
  let u = url
  // Remove common thumbnail size suffixes
  u = u.replace(/_(\d+x\d+|[a-z]\d*)\.(jpg|jpeg|png|webp|gif)$/i, '.$2')
  u = u.replace(/\?\w+=\d+/g, '')
  return u
}

function fromProductImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    '.goods-main-pic img',
    '.main-img img',
    '.product-image img',
    '.goods-gallery img',
    '[class*="main-pic"] img',
    '[class*="product-img"] img',
    '[class*="goods-img"] img'
  ]
  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll(sel))) {
      const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-original') || ''
      if (!src) continue
      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const hdUrl = enlargeMogujieUrl(abs)
      const cand = makeMediaCandidate({
        url: hdUrl,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.88,
        site: 'mogujie'
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
    '.goods-desc img',
    '[class*="detail"] img',
    '[class*="desc"] img',
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
        confidence: 0.84,
        site: 'mogujie'
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
    if (!MOGUJIE_CDN_RE.test(src)) continue
    if (src.includes('icon') || src.includes('logo') || src.includes('avatar')) continue
    const abs = toAbsoluteUrl(src, pageUrl)
    if (!abs) continue
    const hdUrl = enlargeMogujieUrl(abs)
    const cand = makeMediaCandidate({
      url: hdUrl,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.82,
      site: 'mogujie'
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
    site: 'mogujie'
  })
  if (cand) out.push(cand)
  return out
}

export function resolveMogujieCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  if (!HOST_RE.test(location.hostname)) return []

  return dedupeCandidates([
    ...fromOgImage(pageUrl, pageTitle),
    ...fromProductImages(pageUrl, pageTitle),
    ...fromDetailImages(pageUrl, pageTitle),
    ...fromCdnImages(pageUrl, pageTitle)
  ])
}
