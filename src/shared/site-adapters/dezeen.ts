import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const HOST_RE = /dezeen\.com/i

/** Dezeen CDN domains */
const DEZEEN_CDN_RE = /dezeen\.com.*\.(?:jpg|jpeg|png|webp)|cdn[^.]*\.dezeen\.com/i

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
      site: 'dezeen'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromProjectImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    '.article-image img',
    '.featured-image img',
    '.project-gallery img',
    '.gallery img',
    '.slideshow img',
    '.carousel img',
    '[class*="article-image"] img',
    '[class*="gallery"] img',
    '[class*="slide"] img',
    '.image-wrapper img',
    '.main-image img'
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
        site: 'dezeen'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromArticleBody(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    'article .body img',
    '.article-body img',
    '.post-body img',
    '.entry-body img',
    '.content img',
    '[class*="article-body"] img',
    '[class*="post-body"] img',
    '[class*="body--article"] img'
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
        site: 'dezeen'
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
    if (!txt.includes('dezeen.com')) continue
    const re = /https?:\/\/[^"'\s<>]*(?:dezeen\.com|cdn[^.]*dezeen\.com)[^"'\s<>]*?\.(?:jpg|jpeg|png|webp|gif)(?:\?[^\s"']*)?/gi
    const hits = txt.match(re) || []
    for (const hit of hits) {
      if (hit.includes('icon') || hit.includes('logo')) continue
      const abs = toAbsoluteUrl(hit, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.86,
        site: 'dezeen'
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
    if (!DEZEEN_CDN_RE.test(src)) continue
    if (src.includes('icon') || src.includes('logo') || src.includes('avatar')) continue
    const abs = toAbsoluteUrl(src, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.84,
      site: 'dezeen'
    })
    if (cand) out.push(cand)
  }
  return out
}

export function resolveDezeenCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  if (!HOST_RE.test(location.hostname)) return []

  return dedupeCandidates([
    ...fromOgImage(pageUrl, pageTitle),
    ...fromProjectImages(pageUrl, pageTitle),
    ...fromArticleBody(pageUrl, pageTitle),
    ...fromEmbeddedData(pageUrl, pageTitle),
    ...fromCdnImages(pageUrl, pageTitle)
  ])
}
