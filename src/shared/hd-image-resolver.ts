import {
  enlargeImageUrl,
  isLowResTwitterMediaUrl,
  twitterMediaCandidateUrls
} from './url-enlarger'
import { discoverTwitterMediaUrls, isXPageHost } from './x-media-urls'

export type HdImageCandidate = {
  url: string
  source: string
}

export type HdImageResolveResult = {
  candidates: HdImageCandidate[]
  referer: string
  pageTitle: string
  pageUrl: string
}

function toAbsoluteUrl(raw: string, base: string): string | null {
  const t = raw.trim()
  if (!t) return null
  try {
    return new URL(t, base).href
  } catch {
    return null
  }
}

function isLikelyImageUrl(url: string): boolean {
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false
  if (url.startsWith('data:') || url.startsWith('blob:')) return false
  if (/\.(jpg|jpeg|png|gif|webp|avif|bmp)(\?|#|$)/i.test(url)) return true
  if (/pinimg\.com|twimg\.com|cdn\.dribbble\.com|cdninstagram|fbcdn\.net/i.test(url)) return true
  return false
}

function metaContent(selector: string): string | null {
  const el = document.querySelector(selector)
  const v = el?.getAttribute('content')?.trim()
  return v || null
}

function collectMetaImages(pageUrl: string, onX: boolean): HdImageCandidate[] {
  const out: HdImageCandidate[] = []
  const selectors = [
    ['og:image', 'meta[property="og:image"]'],
    ['og:image:url', 'meta[property="og:image:url"]'],
    ['og:image:secure_url', 'meta[property="og:image:secure_url"]'],
    ['twitter:image', 'meta[name="twitter:image"]'],
    ['twitter:image:src', 'meta[name="twitter:image:src"]']
  ] as const

  for (const [source, sel] of selectors) {
    const raw = metaContent(sel)
    const abs = raw ? toAbsoluteUrl(raw, pageUrl) : null
    if (!abs || !isLikelyImageUrl(abs)) continue
    if (onX && !/\/media\//i.test(abs)) continue
    out.push({ url: abs, source })
  }
  return out
}

function isInViewport(rect: DOMRect): boolean {
  return rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth
}

function collectVisibleImages(pageUrl: string): HdImageCandidate[] {
  const onX = isXHost(location.hostname.toLowerCase())
  const scored: Array<{ url: string; area: number }> = []
  for (const img of Array.from(document.querySelectorAll('img'))) {
    const src = img.currentSrc || img.src
    if (!src) continue
    const abs = toAbsoluteUrl(src, pageUrl)
    if (!abs || !isLikelyImageUrl(abs)) continue
    if (onX && /twimg\.com/i.test(abs) && !/\/media\//i.test(abs)) continue
    const r = img.getBoundingClientRect()
    if (r.width < 80 || r.height < 80) continue
    if (!isInViewport(r)) continue
    scored.push({ url: abs, area: r.width * r.height })
  }
  scored.sort((a, b) => b.area - a.area)
  return scored.slice(0, 5).map((s, i) => ({ url: s.url, source: `img#${i + 1}` }))
}

function isXHost(host: string): boolean {
  return isXPageHost(host)
}

function collectTwitterFromPerformance(pageUrl: string): HdImageCandidate[] {
  if (!isXHost(location.hostname.toLowerCase())) return []
  return discoverTwitterMediaUrls(pageUrl).map((url) => ({
    url,
    source: 'twitter-performance'
  }))
}

function bestUrlFromSrcset(srcset: string, pageUrl: string): string | null {
  let bestUrl = ''
  let bestScore = 0
  for (const part of srcset.split(',')) {
    const chunk = part.trim()
    if (!chunk) continue
    const m = chunk.match(/^(\S+)\s+(\d+(?:\.\d+)?)(w|x)$/i)
    if (m) {
      const score = m[3].toLowerCase() === 'w' ? Number(m[2]) : Number(m[2]) * 1000
      if (score >= bestScore) {
        bestScore = score
        bestUrl = m[1]
      }
      continue
    }
    const bare = chunk.split(/\s+/)[0]
    if (bare.startsWith('http')) bestUrl = bare
  }
  return bestUrl ? toAbsoluteUrl(bestUrl, pageUrl) : null
}

/** Tweet media on X: prefer /media/ + srcset, skip profile_images. */
function collectTwitterMedia(pageUrl: string): HdImageCandidate[] {
  if (!isXHost(location.hostname.toLowerCase())) return []

  const out: HdImageCandidate[] = []
  const seen = new Set<string>()
  const push = (raw: string | null | undefined, source: string) => {
    if (!raw) return
    const abs = toAbsoluteUrl(raw, pageUrl)
    if (!abs || !/\/media\//i.test(abs) || !isLikelyImageUrl(abs) || seen.has(abs)) return
    seen.add(abs)
    out.push({ url: abs, source })
  }

  const selectors = [
    '[data-testid="tweetPhoto"] img',
    '[data-testid="image"] img',
    '[data-testid="tweet"] img[src*="/media/"]',
    'article img[src*="/media/"]',
    'img[src*="pbs.twimg.com/media"]',
    'img[src*="twimg.com/media"]'
  ]
  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(sel))) {
      push(img.currentSrc || img.src, 'twitter-media-dom')
      const fromSet = img.srcset ? bestUrlFromSrcset(img.srcset, pageUrl) : null
      push(fromSet, 'twitter-srcset')
    }
  }

  return out
}

function collectSiteSpecific(pageUrl: string): HdImageCandidate[] {
  const host = location.hostname.toLowerCase()
  const out: HdImageCandidate[] = []

  if (host.includes('pinterest.')) {
    const pinImg =
      document.querySelector<HTMLImageElement>('img[src*="pinimg.com"]') ??
      document.querySelector<HTMLImageElement>('img[src*="i.pinimg.com"]')
    const src = pinImg?.currentSrc || pinImg?.src
    const abs = src ? toAbsoluteUrl(src, pageUrl) : null
    if (abs) out.push({ url: abs, source: 'pinterest-dom' })
  }

  if (host.includes('dribbble.com')) {
    const shot =
      document.querySelector<HTMLImageElement>('.shot-media img, img[src*="cdn.dribbble.com"]') ??
      document.querySelector<HTMLImageElement>('img[src*="cdn.dribbble.com"]')
    const src = shot?.currentSrc || shot?.src
    const abs = src ? toAbsoluteUrl(src, pageUrl) : null
    if (abs) out.push({ url: abs, source: 'dribbble-dom' })
  }

  if (isXHost(host)) {
    out.push(...collectTwitterMedia(pageUrl))
  }

  return out
}

function dedupeCandidates(items: HdImageCandidate[]): HdImageCandidate[] {
  const seen = new Set<string>()
  const out: HdImageCandidate[] = []
  for (const item of items) {
    if (seen.has(item.url)) continue
    seen.add(item.url)
    out.push(item)
  }
  return out
}

/**
 * Resolve ordered download candidates for "HD original" on the current page.
 * Runs in content script context.
 */
export async function resolveHdImageOnPage(): Promise<HdImageResolveResult> {
  const pageUrl = location.href
  const referer = pageUrl
  const pageTitle = document.title || 'image'

  const onX = isXHost(location.hostname.toLowerCase())
  const raw = dedupeCandidates(
    onX
      ? [
          ...collectTwitterFromPerformance(pageUrl),
          ...collectTwitterMedia(pageUrl),
          ...collectMetaImages(pageUrl, true),
          ...collectSiteSpecific(pageUrl),
          ...collectVisibleImages(pageUrl)
        ]
      : [
          ...collectMetaImages(pageUrl, false),
          ...collectSiteSpecific(pageUrl),
          ...collectVisibleImages(pageUrl)
        ]
  )

  const highPriority: HdImageCandidate[] = []
  const lowPriority: HdImageCandidate[] = []
  const seen = new Set<string>()

  const addUrl = (url: string, source: string, hd: boolean) => {
    if (!url || seen.has(url)) return
    seen.add(url)
    const entry = { url, source }
    if (hd) highPriority.push(entry)
    else lowPriority.push(entry)
  }

  for (const item of raw) {
    if (onX && /\/media\//i.test(item.url)) {
      for (const url of twitterMediaCandidateUrls(item.url)) {
        addUrl(url, item.source, !isLowResTwitterMediaUrl(url))
      }
      continue
    }

    const big = await enlargeImageUrl(item.url)
    addUrl(big, item.source, true)
    if (item.url !== big) addUrl(item.url, item.source, false)
  }

  const enlarged = [...highPriority, ...lowPriority]

  if (!enlarged.length) {
    throw new Error('当前页未找到可下载的图片（可尝试对图片右键保存）')
  }

  return { candidates: enlarged, referer, pageTitle, pageUrl }
}
