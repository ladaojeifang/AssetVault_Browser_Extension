import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const HOST_RE = /housebeautiful\.com/i

const HB_CDN_RE = /housebeautiful\.com.*\.(?:jpg|jpeg|png|webp)|hearstapps\.com/i

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
      site: 'housebeautiful'
    })
    if (cand) out.push(cand)
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
    '.body-content img',
    '[class*="article-body"] img',
    '[class*="post-content"] img'
  ]
  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll(sel))) {
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
        site: 'housebeautiful'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromSlideshow(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    '.slideshow img',
    '.slide img',
    '.carousel img',
    '.slideshow-slide img',
    '[class*="slide"] img',
    '[class*="carousel-item"] img',
    '.gallery-image img',
    '.photo-gallery img'
  ]
  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll(sel))) {
      const src = img.src || img.dataset.src || img.dataset.lazySrc || ''
      if (!src) continue
      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.89,
        site: 'housebeautiful'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

export function resolveHousebeautifulCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  if (!HOST_RE.test(location.hostname)) return []

  return dedupeCandidates([
    ...fromOgImage(pageUrl, pageTitle),
    ...fromSlideshow(pageUrl, pageTitle),
    ...fromArticleBody(pageUrl, pageTitle)
  ])
}
