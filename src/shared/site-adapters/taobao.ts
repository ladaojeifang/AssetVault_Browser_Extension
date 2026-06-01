import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const HOST_RE = /taobao\.com|tmall\.com|taobaocdn\.com/i

const TAOBAO_CDN_RE = /img[^.]*\.taobaocdn\.com|gd[^.]*\.alicdn\.com|img\.alibaba\.com/i

/** Replace Taobao/Tmall thumbnail suffix with original-size version */
function enlargeTaobaoUrl(url: string): string {
  let u = url
  // Common thumbnail suffixes: _sum.jpg, _sq.jpg, _b.jpg, _220x220.jpg, etc.
  u = u.replace(/_(sum|sq|b|q|60x60|120x120|220x220|240_240)\.(jpg|jpeg|png|webp|gif)/i, '.$2')
  // Handle _.webp / _.jpg pattern (original is without the underscore prefix)
  // Handle cx-*.jpg patterns
  u = u.replace(/_cx-\w+\./, '.')
  return u
}

function fromProductMainImage(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // Taobao main product images
  const taobaoSelectors = ['.tb-main-img img', '.tb-pic img', '#J_ImgBooth img', '.main-image img']
  // Tmall-specific selectors
  const tmallSelectors = ['.tm-buyer-photo img', '.tm-main-img img', '#J_ImgBooth img']

  for (const sel of [...taobaoSelectors, ...tmallSelectors]) {
    for (const img of Array.from(document.querySelectorAll(sel))) {
      const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-ks-lazyload') || ''
      if (!src) continue
      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const hdUrl = enlargeTaobaoUrl(abs)
      const cand = makeMediaCandidate({
        url: hdUrl,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.88,
        site: 'taobao'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromDetailContent(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    '.content img',
    '.detail-content img',
    '#J_DivItemDesc img',
    '[id*="desc"] img',
    '[class*="detail"] img'
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
        confidence: 0.80,
        site: 'taobao'
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
    if (!TAOBAO_CDN_RE.test(src)) continue
    if (src.includes('icon') || src.includes('logo') || src.includes('search')) continue
    const abs = toAbsoluteUrl(src, pageUrl)
    if (!abs) continue
    const hdUrl = enlargeTaobaoUrl(abs)
    const cand = makeMediaCandidate({
      url: hdUrl,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.78,
      site: 'taobao'
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
  const hdUrl = enlargeTaobaoUrl(abs)
  const cand = makeMediaCandidate({
    url: hdUrl,
    pageUrl,
    pageTitle,
    referer: pageUrl,
    confidence: 0.85,
    site: 'taobao'
  })
  if (cand) out.push(cand)
  return out
}

export function resolveTaobaoCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  if (!HOST_RE.test(location.hostname)) return []

  return dedupeCandidates([
    ...fromOgImage(pageUrl, pageTitle),
    ...fromProductMainImage(pageUrl, pageTitle),
    ...fromDetailContent(pageUrl, pageTitle),
    ...fromCdnImages(pageUrl, pageTitle)
  ])
}
