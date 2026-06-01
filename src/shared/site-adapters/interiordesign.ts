import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const HOST_RE = /interiordesign\.net/i

/** Interior Design magazine CDN domains */
const ID_CDN_RE = /interiordesign\.net.*\.(?:jpg|jpeg|png|webp)|cdn[^.]*\.interiordesign\.net/i

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
      confidence: 0.87,
      site: 'interiordesign'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromSlideshow(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    '.slideshow img',
    '.slide img',
    '.slideshow-container img',
    '.slides img',
    '.slideshow-slide img',
    '[class*="slideshow"] img',
    '[class*="slide-show"] img',
    '.gallery-slides img',
    '.image-slider img',
    '.carousel-inner img',
    '.fotorama img'
  ]
  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(sel))) {
      const src = img.src || img.dataset.src || img.dataset.original || ''
      if (!src) continue
      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.89,
        site: 'interiordesign'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromGalleryImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    '.gallery img',
    '.gallery-grid img',
    '.image-gallery img',
    '.photo-gallery img',
    '.project-gallery img',
    '.product-gallery img',
    '[class*="gallery"] img',
    '[class*="photo-gallery"] img',
    '.grid-image img',
    '.masonry img'
  ]
  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(sel))) {
      const src = img.src || img.dataset.src || ''
      if (!src) continue
      if (img.naturalWidth && img.naturalWidth < 100) continue
      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.88,
        site: 'interiordesign'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromArticleContent(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    'article img',
    '.article-body img',
    '.post-content img',
    '.entry-content img',
    '.content img',
    '[class*="article-body"] img',
    '[class*="post-content"] img'
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
        site: 'interiordesign'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

export function resolveInteriordesignCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  if (!HOST_RE.test(location.hostname)) return []

  return dedupeCandidates([
    ...fromOgImage(pageUrl, pageTitle),
    ...fromSlideshow(pageUrl, pageTitle),
    ...fromGalleryImages(pageUrl, pageTitle),
    ...fromArticleContent(pageUrl, pageTitle)
  ])
}
