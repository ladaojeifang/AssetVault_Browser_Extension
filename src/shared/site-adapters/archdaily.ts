import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const HOST_RE = /archdaily\.(com|cn)/i

/** ArchDaily CDN domains */
const AD_CDN_RE = /adst[^.]*\.com|(?:adst[^.]*)?adimg\.|archdaily\.(com|cn).*\.(?:jpg|jpeg|png|webp)/i

function fromOgImage(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const prop of ['og:image', 'og:image:url']) {
    const content = document.querySelector(`meta[property="${prop}"]`)?.getAttribute('content') || ''
    if (!content) continue
    const abs = toAbsoluteUrl(content, pageUrl)
    if (!abs) continue
    // ArchDaily og:image is typically the main project image in good resolution
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.90,
      site: 'archdaily'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromGalleryPhotos(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    '.gallery__photo img',
    '.gallery-photo img',
    '.gallery img',
    '.photo-gallery img',
    '.article-image img',
    '.project-image img',
    '.afp-img img',
    '.news-article__image img',
    '[class*="gallery__photo"] img',
    '[class*="gallery-photo"] img',
    '.swiper-slide img',
    '.carousel img',
    '.slideshow img'
  ]
  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(sel))) {
      const src = img.src || img.dataset.src || img.dataset.original || ''
      if (!src) continue
      if (img.naturalWidth && img.naturalWidth < 100) continue
      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.89,
        site: 'archdaily'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromArticleBody(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    'article img',
    '.article-body img',
    '.post-content img',
    '.entry-content img',
    '.body-text img',
    '.content img',
    '[class*="article-body"] img',
    '[class*="post-content"] img',
    '[class*="body-text"] img',
    '.render-grid img'
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
        confidence: 0.87,
        site: 'archdaily'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromEmbeddedData(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const s of Array.from(document.querySelectorAll<HTMLImageElement>('script'))) {
    const txt = s.textContent || ''
    if (!txt.includes('.adst.')) continue
    const re = /https?:\/\/(?:adst[^.]*\.com|adimg\.[^"'\s]+)[^"'\s<>]*?\.(?:jpg|jpeg|png|webp|gif)(?:\?[^\s"']*)?/gi
    const hits = txt.match(re) || []
    for (const hit of hits) {
      if (hit.includes('icon') || hit.includes('logo') || hit.includes('avatar')) continue
      const abs = toAbsoluteUrl(hit, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.86,
        site: 'archdaily'
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
    if (!AD_CDN_RE.test(src)) continue
    if (src.includes('icon') || src.includes('logo') || src.includes('avatar')) continue
    const abs = toAbsoluteUrl(src, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.85,
      site: 'archdaily'
    })
    if (cand) out.push(cand)
  }
  return out
}

export function resolveArchdailyCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  if (!HOST_RE.test(location.hostname)) return []

  return dedupeCandidates([
    ...fromOgImage(pageUrl, pageTitle),
    ...fromGalleryPhotos(pageUrl, pageTitle),
    ...fromArticleBody(pageUrl, pageTitle),
    ...fromEmbeddedData(pageUrl, pageTitle),
    ...fromCdnImages(pageUrl, pageTitle)
  ])
}
