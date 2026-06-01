import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const HOST_RE = /1688\.com/i

const ALIBABA_CDN_RE = /cbu01\.alicdn\.com|cbu02\.alicdn\.com|aliyun\.com\/img|1688\.com.*\.(?:jpg|jpeg|png|webp)/i

/** Enlarge 1688/AliExpress images to original size */
function enlarge1688Url(url: string): string {
  let u = url
  // Remove size suffixes commonly used in Alibaba CDN
  u = u.replace(/_(\d+x\d+)\.(jpg|jpeg|png|webp|gif)$/i, '.$2')
  u = u.replace(/_\d+x\d+_[a-zA-Z]+\./, '.')
  // Handle .50x50.jpg style
  u = u.replace(/\.\d+x\d+\./, '.')
  return u
}

function fromProductMainImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    '.main-img img',
    '.tab-content img',
    '.detail-gallery-turn img',
    '.obj-content img',
    '#dt-tab img',
    '[class*="main-img"] img',
    '[class*="tab-content"] img',
    '.subject-wrap img'
  ]
  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(sel))) {
      const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-ks-lazyload') || ''
      if (!src) continue
      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const hdUrl = enlarge1688Url(abs)
      const cand = makeMediaCandidate({
        url: hdUrl,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.88,
        site: '1688'
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
    '.desc-content img',
    '[class*="detail-content"] img',
    '[class*="detail-desc"] img',
    '[id*="desc"] img',
    '.customized-detail img'
  ]
  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(sel))) {
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
        site: '1688'
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
    if (!ALIBABA_CDN_RE.test(src)) continue
    if (src.includes('icon') || src.includes('logo') || src.includes('search')) continue
    const abs = toAbsoluteUrl(src, pageUrl)
    if (!abs) continue
    const hdUrl = enlarge1688Url(abs)
    const cand = makeMediaCandidate({
      url: hdUrl,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.82,
      site: '1688'
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
    site: '1688'
  })
  if (cand) out.push(cand)
  return out
}

export function resolve1688Candidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  if (!HOST_RE.test(location.hostname)) return []

  return dedupeCandidates([
    ...fromOgImage(pageUrl, pageTitle),
    ...fromProductMainImages(pageUrl, pageTitle),
    ...fromDetailImages(pageUrl, pageTitle),
    ...fromCdnImages(pageUrl, pageTitle)
  ])
}
