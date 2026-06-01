import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const HOST_RE = /archilovers\.com/i

/** Archilovers CDN domains */
const AL_CDN_RE = /archilovers\.com.*\.(?:jpg|jpeg|png|webp)|cdn[^.]*\.archilovers\.com/i

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
      site: 'archilovers'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromProjectGallery(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    '.project-gallery img',
    '.gallery-img img',
    '.project-photos img',
    '.image-gallery img',
    '.slider img',
    '.carousel img',
    '.fotorama img',
    '.swipebox img',
    '[class*="gallery"] img',
    '[class*="project-photo"] img',
    '[class*="project-image"] img',
    '.project-cover img'
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
        site: 'archilovers'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromProjectContent(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    '.project-content img',
    '.description img',
    '.detail-content img',
    '.text-content img',
    '[class*="project-desc"] img',
    '[class*="detail"] img'
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
        site: 'archilovers'
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
    if (!AL_CDN_RE.test(src)) continue
    if (src.includes('icon') || src.includes('logo') || src.includes('avatar') || src.includes('flag')) continue
    const abs = toAbsoluteUrl(src, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.83,
      site: 'archilovers'
    })
    if (cand) out.push(cand)
  }
  return out
}

export function resolveArchiloversCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  if (!HOST_RE.test(location.hostname)) return []

  return dedupeCandidates([
    ...fromOgImage(pageUrl, pageTitle),
    ...fromProjectGallery(pageUrl, pageTitle),
    ...fromProjectContent(pageUrl, pageTitle),
    ...fromCdnImages(pageUrl, pageTitle)
  ])
}
