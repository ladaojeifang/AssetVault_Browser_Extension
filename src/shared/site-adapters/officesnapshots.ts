import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const HOST_RE = /officesnapshots\.com/i

/** Office Snapshots CDN - typically self-hosted or on a CDN subdomain */
const OS_CDN_RE = /officesnapshots\.com.*\.(?:jpg|jpeg|png|webp)|cdn[^.]*\.officesnapshots\.com/i

function fromOgImage(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const prop of ['og:image', 'og:image:url']) {
    const content = document.querySelector(`meta[property="${prop}"]`)?.getAttribute('content') || ''
    if (!content) continue
    const abs = toAbsoluteUrl(content, pageUrl)
    if (!abs) continue
    // og:image on OfficeSnapshots is usually the main project hero image
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.89,
      site: 'officesnapshots'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromProjectImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    '.project-gallery img',
    '.project-photos img',
    '.office-images img',
    '.image-list img',
    '.post-content img',
    '.entry-content img',
    'article img',
    '.gallery img',
    '[class*="project"] img',
    '[class*="gallery"] img',
    '[class*="photo"] img',
    '#main-content img',
    '.content-area img'
  ]
  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(sel))) {
      const src = img.src || img.dataset.src || img.dataset.original || ''
      if (!src) continue
      if (img.naturalWidth && img.naturalWidth < 100) continue
      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      // OfficeSnapshots project images are typically high quality
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.91,
        site: 'officesnapshots'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromBackgroundImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // OfficeSnapshots often uses background-image for large project photos
  const bgSelectors = [
    '.project-image',
    '.hero-image',
    '.full-width-image',
    '.gallery-item',
    '[class*="project-hero"]',
    '[class*="cover-image"]'
  ]
  for (const sel of bgSelectors) {
    for (const el of Array.from(document.querySelectorAll<HTMLImageElement>(sel))) {
      const bgStyle = el.style.backgroundImage || getComputedStyle(el).backgroundImage || ''
      const match = bgStyle.match(/url\(['"]?(.*?)['"]?\)/)
      if (!match || !match[1]) continue
      const abs = toAbsoluteUrl(match[1], pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.90,
        site: 'officesnapshots'
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
    if (!OS_CDN_RE.test(src)) continue
    if (src.includes('icon') || src.includes('logo')) continue
    const abs = toAbsoluteUrl(src, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.87,
      site: 'officesnapshots'
    })
    if (cand) out.push(cand)
  }
  return out
}

export function resolveOfficesnapshotsCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  if (!HOST_RE.test(location.hostname)) return []

  return dedupeCandidates([
    ...fromOgImage(pageUrl, pageTitle),
    ...fromProjectImages(pageUrl, pageTitle),
    ...fromBackgroundImages(pageUrl, pageTitle),
    ...fromCdnImages(pageUrl, pageTitle)
  ])
}
