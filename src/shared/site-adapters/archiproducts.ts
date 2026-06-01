import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const HOST_RE = /archiproducts\.com/i

/** Archiproducts CDN domains */
const AP_CDN_RE = /archiproducts\.com.*\.(?:jpg|jpeg|png|webp)|cdn[^.]*\.archiproducts\.com/i

function fromOgImage(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const prop of ['og:image', 'og:image:url']) {
    const content = document.querySelector(`meta[property="${prop}"]`)?.getAttribute('content') || ''
    if (!content) continue
    const abs = toAbsoluteUrl(content, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.88,
      site: 'archiproducts'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromProductGallery(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    '.product-gallery img',
    '.product-images img',
    '.gallery-thumb img',
    '.main-product-image img',
    '.product-slider img',
    '.carousel-inner img',
    '[class*="gallery"] img',
    '[class*="product-image"] img',
    '[class*="thumb"] img',
    '.fotorama img',
    '.slick-slide img'
  ]
  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(sel))) {
      const src = img.src || img.dataset.src || img.dataset.original || ''
      if (!src) continue
      if (img.naturalWidth && img.naturalWidth < 64) continue
      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.89,
        site: 'archiproducts'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromArticleContent(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    '.article-body img',
    '.product-description img',
    '.description img',
    '.content img',
    '[class*="article"] img',
    '[class*="description"] img',
    '[class*="content"] img'
  ]
  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(sel))) {
      const src = img.src || ''
      if (!src) continue
      if (img.naturalWidth && img.naturalWidth < 100) continue
      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.85,
        site: 'archiproducts'
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
    if (!AP_CDN_RE.test(src)) continue
    if (src.includes('icon') || src.includes('logo') || src.includes('flag')) continue
    const abs = toAbsoluteUrl(src, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.82,
      site: 'archiproducts'
    })
    if (cand) out.push(cand)
  }
  return out
}

export function resolveArchiproductsCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  if (!HOST_RE.test(location.hostname)) return []

  return dedupeCandidates([
    ...fromOgImage(pageUrl, pageTitle),
    ...fromProductGallery(pageUrl, pageTitle),
    ...fromArticleContent(pageUrl, pageTitle),
    ...fromCdnImages(pageUrl, pageTitle)
  ])
}
