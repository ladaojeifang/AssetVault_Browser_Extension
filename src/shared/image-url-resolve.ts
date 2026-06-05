/**
 * Best image URL from <img> / srcset — aligned with batch scan (page-image-scanner, wechat adapter).
 */

import { absoluteUrl } from './collect-meta-core'
import {
  isArticleImageUrl,
  isNoiseImageUrl,
  isPlaceholderImageSrc,
  pickBestImageUrl,
} from './image-url-quality'

export {
  isArticleImageUrl,
  isNoiseImageUrl,
  isOffArticleCdnImage,
  isPlaceholderImageSrc,
  imageUrlQualityScore,
  pickBestImageUrl,
} from './image-url-quality'

const LAZY_ATTRS = [
  'data-src',
  'data-originalsrc',
  'data-mmsrc',
  'data-original',
  'data-actualsrc',
  'data-lazy-src',
  'data-lazy',
  'data-url',
  'data-imgurl',
  'data-image',
]

const WECHAT_HOST_RE = /mp\.weixin\.qq\.com|weixin\.qq\.com/i

export function bestFromSrcset(srcset: string, pageUrl: string): string | null {
  let bestUrl = ''
  let bestScore = 0
  for (const part of srcset.split(',')) {
    const chunk = part.trim()
    if (!chunk) continue
    const m = chunk.match(/^(\S+)\s+(\d+(?:\.\d+)?)(w|x)$/i)
    if (m) {
      const numeric = m[3].toLowerCase() === 'w' ? Number(m[2]) : Number(m[2]) * 1000
      if (numeric >= bestScore) {
        bestScore = numeric
        bestUrl = m[1]
      }
      continue
    }
    const bare = chunk.split(/\s+/)[0]
    if (bare.startsWith('http')) bestUrl = bare
  }
  return bestUrl ? absoluteUrl(bestUrl, pageUrl) : null
}

function isWechatPage(pageUrl: string): boolean {
  try {
    return WECHAT_HOST_RE.test(new URL(pageUrl).hostname)
  } catch {
    return WECHAT_HOST_RE.test(pageUrl)
  }
}

function addUrl(out: string[], raw: string | null | undefined, pageUrl: string): void {
  if (!raw?.trim() || isPlaceholderImageSrc(raw)) return
  const abs = absoluteUrl(raw.trim(), pageUrl)
  if (abs && /^https?:\/\//i.test(abs)) out.push(abs)
}

/** Collect candidate URLs from one <img> (parsed HTML or live DOM). */
export function collectImageUrlsFromImg(img: Element, pageUrl: string): string[] {
  const out: string[] = []
  const wechat = isWechatPage(pageUrl)

  const srcset = img.getAttribute('srcset')
  if (srcset) {
    const best = bestFromSrcset(srcset, pageUrl)
    if (best) out.push(best)
  }

  const src = img.getAttribute('src') || ''
  const currentSrc =
    img instanceof HTMLImageElement && img.currentSrc && !isPlaceholderImageSrc(img.currentSrc)
      ? img.currentSrc
      : ''

  if (wechat) {
    for (const attr of ['data-src', 'data-originalsrc', 'data-mmsrc', ...LAZY_ATTRS]) {
      addUrl(out, img.getAttribute(attr), pageUrl)
    }
    addUrl(out, currentSrc, pageUrl)
    addUrl(out, src, pageUrl)
  } else {
    addUrl(out, currentSrc, pageUrl)
    if (!isPlaceholderImageSrc(src)) addUrl(out, src, pageUrl)
    for (const attr of LAZY_ATTRS) addUrl(out, img.getAttribute(attr), pageUrl)
  }

  const parent = img.closest('a[href]')
  if (parent) {
    const href = parent.getAttribute('href') || ''
    if (/\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i.test(href)) {
      addUrl(out, href, pageUrl)
    }
  }

  return [...new Set(out)]
}

export function resolveBestImageUrlFromImg(img: Element, pageUrl: string): string | null {
  return pickBestImageUrl(collectImageUrlsFromImg(img, pageUrl), pageUrl)
}
