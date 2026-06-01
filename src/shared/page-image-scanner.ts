/**
 * Multi-source page image discovery with confidence scanning.
 *
 * Core: collectPageImageCandidates, mergeImageCandidates, imageCandidatesToCollectMeta
 * Add-ons:
 *   - collectFromIframes          — same-origin iframe traversal
 *   - startPageObserver           — MutationObserver with 300ms debounce
 *   - SVG <image href> detection  (inside walkDeep)
 *   - collectBase64Images         — data:image extraction
 *   - collectCanvasCandidates     — canvas element detection
 */

import { absoluteUrl, filenameFromUrl } from './collect-meta-core'
import type { CollectMeta } from './types'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export type NewCandidateCallback = (
  candidates: PageImageCandidate[]
) => void

export type PageObserverOptions = {
  /** Debounce in ms (default 300). */
  debounce?: number
  /** Also observe iframes. */
  watchIframes?: boolean
}

export type PageImageCandidate = {
  url: string
  source: string
  score: number
  width?: number
  height?: number
}

const LAZY_ATTRS = [
  'data-src',
  'data-original',
  'data-lazy-src',
  'data-lazy',
  'data-url',
  'data-actualsrc',
  'data-imgurl',
  'data-image'
]

const META_SELECTORS: Array<[string, string]> = [
  ['meta-og:image', 'meta[property="og:image"]'],
  ['meta-og:image:url', 'meta[property="og:image:url"]'],
  ['meta-og:image:secure', 'meta[property="og:image:secure_url"]'],
  ['meta-twitter:image', 'meta[name="twitter:image"]'],
  ['meta-twitter:image:src', 'meta[name="twitter:image:src"]'],
  ['meta-itemprop', 'meta[itemprop="image"]']
]

const SOURCE_BASE_SCORE: Record<string, number> = {
  'meta-og:image': 0.92,
  'meta-og:image:url': 0.9,
  'meta-og:image:secure': 0.9,
  'meta-twitter:image': 0.88,
  'meta-twitter:image:src': 0.86,
  'meta-itemprop': 0.82,
  srcset: 0.84,
  'picture-source': 0.8,
  'dom-img': 0.72,
  lazy: 0.68,
  performance: 0.58,
  background: 0.52,
  'json-ld': 0.75
}

function isLikelyImageUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false
  // Standard image extension in path (before query/hash)
  if (/\.(jpg|jpeg|png|gif|webp|avif|bmp|svg)(\?|#|$)/i.test(url)) return true
  // Underscore-prefixed format used by Tencent CDN: mmbiz_jpg, mmbiz_png, etc.
  if (/_(jpg|jpeg|png|gif|webp|avif|bmp|svg)[/?#]/i.test(url)) return true
  // wx_fmt=xxx query param used by WeChat articles
  if (/wx_fmt=\w{3,4}/i.test(url)) return true
  // Known image CDN domains
  if (/pinimg\.com|twimg\.com|cdninstagram|fbcdn|dribbble|artstation|unsplash|pexels|hdslb|bilivideo|mmbiz\.qpic|xhscdn\.com|sinaimg|bdstatic|tiebapic|imgoebjb/i.test(url)) {
    return true
  }
  return false
}

function isAdOrNoiseUrl(url: string): boolean {
  if (/pixel|tracking|analytics|spacer|1x1|favicon|logo\.(?:png|svg)/i.test(url)) return true
  if (/avatar|profile_images|profile_banners|\/emoji\//i.test(url)) return true
  if (/ads?\.|doubleclick|googlesyndication/i.test(url)) return true
  return false
}

function urlQualityBoost(url: string): number {
  let b = 0
  if (/name=orig|original|\/originals\/|_b\.jpg|max_1200|w=\d{4,}/i.test(url)) b += 0.28
  if (/name=large|name=4096|name=medium/i.test(url)) b += 0.12
  if (/name=small|name=thumb|thumb|mini|sprite|icon|_xs\.|_s\./i.test(url)) b -= 0.35
  return b
}

function scoreCandidate(
  url: string,
  source: string,
  width?: number,
  height?: number
): number {
  let score = SOURCE_BASE_SCORE[source] ?? 0.45
  score += urlQualityBoost(url)

  if (width !== undefined && height !== undefined && width > 0 && height > 0) {
    const area = width * height
    if (area < 64) return -1
    if (area < 400) score -= 0.25
    else if (area > 40_000) score += 0.12
  }

  return score
}

function bestFromSrcset(srcset: string, pageUrl: string): string | null {
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

function walkDeep(cb: (root: Document | ShadowRoot | Element) => void): void {
  const walk = (root: Document | ShadowRoot | Element) => {
    cb(root)
    root.querySelectorAll('*').forEach((el) => {
      if (el.shadowRoot) walk(el.shadowRoot)
    })
  }
  walk(document)
}

/* ------------------------------------------------------------------ */
/*  3c. SVG <image href / xlink:href> detection                        */
/* ------------------------------------------------------------------ */

/** Extract image URL from an SVG <image> element (href or xlink:href). */
function svgImageUrl(imgEl: SVGImageElement): string | null {
  return (
    imgEl.getAttribute('href') ??
    imgEl.getAttribute('xlink:href') ??
    null
  )
}

function collectFromJsonLd(pageUrl: string, push: (url: string, source: string) => void): void {
  for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    const text = script.textContent || ''
    if (!text.includes('http')) continue
    const re = /https?:\/\/[^"'\s]+\.(?:jpg|jpeg|png|webp|gif)[^"'\s]*/gi
    for (const hit of text.match(re) || []) {
      push(hit, 'json-ld')
    }
  }
}

/** Collect all image URL candidates (unsorted). */
export function collectPageImageCandidates(
  pageUrl: string,
  _pageTitle: string
): PageImageCandidate[] {
  const out: PageImageCandidate[] = []

  const pushRaw = (
    raw: string | null | undefined,
    source: string,
    width?: number,
    height?: number
  ) => {
    if (!raw?.trim()) return
    const url = absoluteUrl(raw.trim(), pageUrl)
    if (!url || !isLikelyImageUrl(url) || isAdOrNoiseUrl(url)) return
    const score = scoreCandidate(url, source, width, height)
    if (score < 0) return
    out.push({ url, source, score, width, height })
  }

  for (const [source, sel] of META_SELECTORS) {
    const v = document.querySelector(sel)?.getAttribute('content')
    pushRaw(v, source)
  }

  collectFromJsonLd(pageUrl, pushRaw)

  try {
    for (const e of performance.getEntriesByType('resource')) {
      const name = (e as PerformanceResourceTiming).name
      if (name && isLikelyImageUrl(name)) pushRaw(name, 'performance')
    }
  } catch {
    /* ignore */
  }

  walkDeep((root) => {
    root.querySelectorAll('picture source[srcset], picture source[src]').forEach((el) => {
      if (!(el instanceof HTMLSourceElement)) return
      const fromSet = el.srcset ? bestFromSrcset(el.srcset, pageUrl) : null
      pushRaw(fromSet || el.src, 'picture-source')
    })

    root.querySelectorAll('img').forEach((img) => {
      if (!(img instanceof HTMLImageElement)) return
      const w = img.naturalWidth || img.width
      const h = img.naturalHeight || img.height
      pushRaw(img.currentSrc || img.src, 'dom-img', w, h)
      const srcset = img.getAttribute('srcset')
      if (srcset) {
        const best = bestFromSrcset(srcset, pageUrl)
        if (best) pushRaw(best, 'srcset', w, h)
      }
      for (const attr of LAZY_ATTRS) {
        pushRaw(img.getAttribute(attr), 'lazy', w, h)
      }
    })

    root.querySelectorAll('[style*="background"]').forEach((el) => {
      if (!(el instanceof HTMLElement)) return
      const bg = getComputedStyle(el).backgroundImage
      if (!bg || bg === 'none') return
      const m = bg.match(/url\(["']?([^"')]+)["']?\)/)
      if (m?.[1]) pushRaw(m[1], 'background')
    })

    // 3c. SVG <image> elements
    root.querySelectorAll('image').forEach((el) => {
      if (!(el instanceof SVGImageElement)) return
      const href = svgImageUrl(el)
      if (href) pushRaw(href, 'svg-image')
    })
  })

  return out
}

/** Dedupe by URL, keep highest score per URL. */
export function mergeImageCandidates(candidates: PageImageCandidate[]): PageImageCandidate[] {
  const byUrl = new Map<string, PageImageCandidate>()
  for (const c of candidates) {
    const prev = byUrl.get(c.url)
    if (!prev || c.score > prev.score) byUrl.set(c.url, c)
  }
  return [...byUrl.values()].sort((a, b) => b.score - a.score)
}

export function imageCandidatesToCollectMeta(
  candidates: PageImageCandidate[],
  pageUrl: string,
  pageTitle: string
): CollectMeta[] {
  return mergeImageCandidates(candidates).map((c) => ({
    url: c.url,
    filename: filenameFromUrl(c.url),
    pageUrl,
    pageTitle,
    width: c.width,
    height: c.height
  }))
}

/* ------------------------------------------------------------------ */
/*  3a. Same-origin iframe scanning                                     */
/* ------------------------------------------------------------------ */

/**
 * Recursively scan same-origin iframes for image/video/background/meta
 * tags and push candidates via `pushRaw`-style callback.
 */
export function collectFromIframes(
  pageUrl: string,
  pushRaw: (url: string, source: string) => void
): void {
  const scanDoc = (doc: Document) => {
    // <img>
    doc.querySelectorAll('img').forEach((img) => {
      if (!(img instanceof HTMLImageElement)) return
      const src = img.currentSrc || img.src
      if (src) {
        const url = absoluteUrl(src, pageUrl)
        if (url && isLikelyImageUrl(url)) pushRaw(url, 'iframe-img')
      }
      for (const attr of LAZY_ATTRS) {
        const v = img.getAttribute(attr)
        if (v) {
          const url = absoluteUrl(v, pageUrl)
          if (url && isLikelyImageUrl(url)) pushRaw(url, 'iframe-lazy')
        }
      }
    })

    // <video> / poster
    doc.querySelectorAll('video').forEach((vid) => {
      if (!(vid instanceof HTMLVideoElement)) return
      const poster = vid.poster
      if (poster) {
        const url = absoluteUrl(poster, pageUrl)
        if (url && isLikelyImageUrl(url)) pushRaw(url, 'iframe-video-poster')
      }
    })

    // background-image
    doc.querySelectorAll('*').forEach((el) => {
      if (!(el instanceof HTMLElement)) return
      try {
        const bg = getComputedStyle(el).backgroundImage
        if (!bg || bg === 'none') return
        const m = bg.match(/url\(["']?([^"')]+)["']?\)/)
        if (m?.[1]) {
          const url = absoluteUrl(m[1], pageUrl)
          if (url && isLikelyImageUrl(url)) pushRaw(url, 'iframe-bg')
        }
      } catch {
        /* cross-origin style access may throw in some contexts */
      }
    })

    // meta tags
    for (const [, sel] of META_SELECTORS) {
      const v = doc.querySelector(sel)?.getAttribute('content')
      if (v) {
        const url = absoluteUrl(v, pageUrl)
        if (url && isLikelyImageUrl(url)) pushRaw(url, 'iframe-meta')
      }
    }

    // recurse into nested same-origin iframes
    doc.querySelectorAll('iframe').forEach((frame) => {
      try {
        const innerDoc = frame.contentDocument
        if (innerDoc && innerDoc.location?.origin === document.location?.origin) {
          scanDoc(innerDoc)
        }
      } catch {
        /* cross-origin → skip */
      }
    })
  }

  scanDoc(document)
}

/* ------------------------------------------------------------------ */
/*  3b. MutationObserver — detect lazy-loaded images                    */
/* ------------------------------------------------------------------ */

/**
 * Start observing DOM mutations to discover lazily-loaded images.
 * Returns a teardown function that disconnects the observer.
 *
 * @param pageUrl       Base URL used for absolutifying relative URLs.
 * @param onNewCandidate Called with an array of newly discovered candidates (debounced).
 * @param options        Optional debounce and iframe-watching settings.
 */
export function startPageObserver(
  pageUrl: string,
  onNewCandidate: NewCandidateCallback,
  options?: PageObserverOptions
): () => void {
  const debounceMs = options?.debounce ?? 300
  let timerId: ReturnType<typeof setTimeout> | null = null

  const flush = () => {
    if (timerId != null) {
      clearTimeout(timerId)
      timerId = null
    }
    const candidates = collectPageImageCandidates(pageUrl, '')
    if (candidates.length > 0) onNewCandidate(candidates)
  }

  const observer = new MutationObserver(() => {
    if (timerId != null) clearTimeout(timerId)
    timerId = setTimeout(flush, debounceMs)
  })

  observer.observe(document.body ?? document.documentElement, {
    childList: true,
    subtree: true
  })

  // Also observe inside same-origin iframes when requested
  const frameObservers: MutationObserver[] = []

  if (options?.watchIframes !== false) {
    const attachToIframe = (doc: Document) => {
      const obs = new MutationObserver(() => {
        if (timerId != null) clearTimeout(timerId)
        timerId = setTimeout(flush, debounceMs)
      })
      obs.observe(doc.body || doc.documentElement, { childList: true, subtree: true })
      frameObservers.push(obs)

      // recurse into nested frames
      doc.querySelectorAll('iframe').forEach((f) => {
        try {
          const inner = f.contentDocument
          if (inner && inner.location?.origin === document.location?.origin) {
            attachToIframe(inner)
          }
        } catch {
          /* cross-origin */
        }
      })
    }

    document.querySelectorAll('iframe').forEach((f) => {
      try {
        const inner = f.contentDocument
        if (inner && inner.location?.origin === document.location?.origin) {
          attachToIframe(inner)
        }
      } catch {
        /* cross-origin */
      }
    })
  }

  return () => {
    observer.disconnect()
    for (const obs of frameObservers) obs.disconnect()
    if (timerId != null) {
      clearTimeout(timerId)
      timerId = null
    }
  }
}

/* ------------------------------------------------------------------ */
/*  3d. Base64 (data:image) extraction                                 */
/* ------------------------------------------------------------------ */

/**
 * Scan all `<img>` elements whose `src` starts with `data:image`
 * and return CollectMeta entries for them.
 */
export function collectBase64Images(): CollectMeta[] {
  const out: CollectMeta[] = []
  const pageUrl = location.href
  const pageTitle = document.title

  document.querySelectorAll('img[src^="data:image"]').forEach((img) => {
    if (!(img instanceof HTMLImageElement)) return
    const src = img.src
    out.push({
      url: src,
      pageUrl,
      pageTitle,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height
    })
  })

  return out
}

/* ------------------------------------------------------------------ */
/*  3e. Canvas detection                                               */
/* ------------------------------------------------------------------ */

/**
 * Detect canvas elements that have actual rendered dimensions and
 * return CollectMeta entries so callers can export them as images.
 *
 * Only canvases with non-zero width/height are included.
 */
export function collectCanvasCandidates(): CollectMeta[] {
  const out: CollectMeta[] = []
  const pageUrl = location.href
  const pageTitle = document.title

  document.querySelectorAll('canvas').forEach((canvas) => {
    const w = canvas.width
    const h = canvas.height
    if (w <= 0 || h <= 0) return

    // Generate a data URL snapshot of the canvas content
    let dataUrl: string
    try {
      dataUrl = canvas.toDataURL('image/png')
    } catch {
      // Tainted canvas (cross-origin draw) — cannot export
      return
    }

    out.push({
      url: dataUrl,
      pageUrl,
      pageTitle,
      width: w,
      height: h
    })
  })

  return out
}
