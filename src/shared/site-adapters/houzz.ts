import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const HOST_RE = /houzz\.(com|co\.\w{2})/i

/** Houzz CDN domains */
const HOUZZ_CDN_RE = /st\.houzz\.comsimages|houzz\.com.*\.(?:jpg|jpeg|png|webp)/i

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
      site: 'houzz'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromPhotoGrid(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    '.photo-grid img',
    '.photo-gallery img',
    '.project-photo img',
    '.image-container img',
    '.photo-list img',
    '[class*="photo-grid"] img',
    '[class*="photo-gallery"] img',
    '[class*="project-photo"] img',
    '.hz-photo img',
    '.hz-image img'
  ]
  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll(sel))) {
      const src = img.src || img.dataset.src || img.dataset.original || ''
      if (!src) continue
      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.90,
        site: 'houzz'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromProjectImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    '.project-images img',
    '.space-images img',
    '.room-images img',
    '.view-image img',
    '.full-screen-view img',
    '.lightbox-image',
    '[class*="project-image"] img',
    '[class*="space-image"] img'
  ]
  for (const sel of selectors) {
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const src = el.tagName === 'IMG' ? (el as HTMLImageElement).src : el.style.backgroundImage?.replace(/^url\(['"]?|['"]?\)$/, '') || ''
      if (!src) continue
      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.89,
        site: 'houzz'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromEmbeddedData(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const s of Array.from(document.querySelectorAll('script'))) {
    const txt = s.textContent || ''
    if (!txt.includes('.houzz.com') && !txt.includes('st.houzz')) continue
    const re = /https?:\/\/(?:st\.houzz|[^"'\s]*houzz\.(?:com|net))[^"'\s<>]*?\.(?:jpg|jpeg|png|webp|gif)(?:\?[^\s"']*)?/gi
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
        site: 'houzz'
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
    if (!HOUZZ_CDN_RE.test(src)) continue
    if (src.includes('icon') || src.includes('logo') || src.includes('avatar') || src.includes('user-photo')) continue
    const abs = toAbsoluteUrl(src, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.84,
      site: 'houzz'
    })
    if (cand) out.push(cand)
  }
  return out
}

export function resolveHouzzCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  if (!HOST_RE.test(location.hostname)) return []

  return dedupeCandidates([
    ...fromOgImage(pageUrl, pageTitle),
    ...fromPhotoGrid(pageUrl, pageTitle),
    ...fromProjectImages(pageUrl, pageTitle),
    ...fromEmbeddedData(pageUrl, pageTitle),
    ...fromCdnImages(pageUrl, pageTitle)
  ])
}
