import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const HOST_RE = /reddit\.com/i

const REDDIT_IMAGE_CDN_RE = /^https?:\/\/(?:i\.|preview\.)?redd\.it/i

function fromOgMeta(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // og:image and og:video for posts
  const props = ['og:image', 'og:image:url', 'og:video', 'og:video:url']
  for (const prop of props) {
    const content = document.querySelector(`meta[property="${prop}"]`)?.getAttribute('content') || ''
    if (!content) continue
    const abs = toAbsoluteUrl(content, pageUrl)
    if (!abs) continue
    const isVideo = prop.includes('video')
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: isVideo ? 0.89 : 0.88,
      site: 'reddit'
    })
    if (cand) out.push(cand)
  }
  // Also check twitter-style meta tags Reddit uses
  for (const name of ['twitter:image', 'twitter:player:stream']) {
    const content = document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') || ''
    if (!content) continue
    const abs = toAbsoluteUrl(content, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: name.includes('video') || name.includes('player') ? 0.88 : 0.86,
      site: 'reddit'
    })
    if (cand) out.push(cand)
  }
  return out
}

/** New Reddit (shreddit-based UI) media extraction */
function fromNewRedditMedia(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []

  // Post media containers
  const mediaSelectors = [
    'shreddit-post-media img',
    'shreddit-post-media video source',
    '.media-preview img',
    '.media-container img',
    '[data-testid="post-media"] img',
    '.Post img',
  ]

  for (const sel of mediaSelectors) {
    for (const el of Array.from(document.querySelectorAll(sel))) {
      let src = ''
      if (el.tagName.toLowerCase() === 'source' || el.tagName.toLowerCase() === 'video') {
        src =
          el.getAttribute('src') ||
          (el instanceof HTMLVideoElement ? el.currentSrc : '') ||
          ''
      } else {
        src = el.getAttribute('src') || ''
      }
      if (!src) continue

      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const isVideo = /\.(mp4|webm|m4v)(\?|#|$)/i.test(abs)
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: isVideo ? 0.90 : 0.87,
        site: 'reddit'
      })
      if (cand) out.push(cand)
    }
  }

  return out
}

/** Old Reddit (classic UI) media extraction */
function fromOldRedditMedia(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []

  const oldSelectors = [
    '.preview img',
    '.thing[data-url] img',
    '.expando img',
    '.usertext-body img',
    '#siteTable img[src*="redd.it"]',
    '.media-preview-content img',
    '.crosspost-preview img',
  ]

  for (const sel of oldSelectors) {
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(sel))) {
      const src = img.getAttribute('src') || ''
      if (!src) continue
      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue

      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.85,
        site: 'reddit'
      })
      if (cand) out.push(cand)
    }
  }

  // Old reddit gallery support
  for (const galImg of Array.from(document.querySelectorAll<HTMLImageElement>('.gallery-img-tile img, .gallery-nav img'))) {
    const src = galImg.getAttribute('src') || ''
    if (!src) continue
    const abs = toAbsoluteUrl(src, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.88,
      site: 'reddit'
    })
    if (cand) out.push(cand)
  }

  return out
}

/** Extract Reddit CDN images (i.redd.it = original, preview.redd.it = thumbnail) */
function fromRedditCdnImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const seen = new Set<string>()

  for (const img of Array.from(document.querySelectorAll<HTMLImageElement>('img'))) {
    const src = img.getAttribute('src') || ''
    if (!REDDIT_IMAGE_CDN_RE.test(src)) continue

    const abs = toAbsoluteUrl(src, pageUrl)
    if (!abs) continue

    // Dedup by stripping query params and size suffixes
    const dedupeKey = abs.replace(/[?].*/, '').replace(/_(?:width|height)\d*/g, '')
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    // preview.redd.it is a thumbnail, i.redd.it is original
    const isOriginal = abs.includes('i.redd.it/')
    const isPreview = abs.includes('preview.redd.it')

    // For preview URLs, try to construct original URL
    let finalUrl = abs
    if (isPreview && !isOriginal) {
      finalUrl = abs.replace('preview.redd.it', 'i.redd.it').replace(/\?.*$/, '')
    }

    const cand = makeMediaCandidate({
      url: finalUrl,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: isOriginal ? 0.92 : (isPreview ? 0.72 : 0.85),
      site: 'reddit'
    })
    if (cand) out.push(cand)
  }
  return out
}

/** Video post extraction — v.redd.it mp4 URLs */
function fromRedditVideos(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []

  // Direct video elements and their sources
  for (const video of Array.from(document.querySelectorAll<HTMLVideoElement>('video'))) {
    for (const sourceEl of Array.from(video.querySelectorAll('source'))) {
      const src = sourceEl.getAttribute('src') || ''
      if (!src) continue
      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        duration: Number.isFinite(video.duration) ? video.duration : undefined,
        confidence: 0.91,
        site: 'reddit'
      })
      if (cand) out.push(cand)
    }
    // Video currentSrc / src
    for (const vSrc of [video.currentSrc, video.src]) {
      if (!vSrc) continue
      const abs = toAbsoluteUrl(vSrc, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        duration: Number.isFinite(video.duration) ? video.duration : undefined,
        confidence: 0.90,
        site: 'reddit'
      })
      if (cand) out.push(cand)
    }
  }

  // Embedded v.redd.it links from HLS manifests or data attributes
  const videoRe = /https?:\/\/v\.redd\.it\/[^\s"'\\<>]+?\.mp4(\?[^\s"'\\<>]*)?/gi
  for (const s of Array.from(document.querySelectorAll<HTMLImageElement>('script'))) {
    const txt = s.textContent || ''
    const hits = txt.match(videoRe) || []
    for (const hit of hits) {
      const abs = toAbsoluteUrl(hit, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.87,
        site: 'reddit'
      })
      if (cand) out.push(cand)
    }
  }

  return out
}

/** External images linked in Reddit posts (imgur, etc.) */
function fromExternalImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []

  // Images inside post content area that are external
  const contentSelectors = [
    '.usertext-body img:not([src*="reddit"])',
    '.md img:not([src*="reddit"])',
    '.expando img:not([src*="reddit"])',
    '.media-element img:not([src*="reddit"])',
    '[data-click-id="body"] img',
  ]

  for (const sel of contentSelectors) {
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(sel))) {
      const src = img.getAttribute('src') || ''
      if (!src || src.startsWith('data:')) continue
      if (REDDIT_IMAGE_CDN_RE.test(src)) continue // handled by fromRedditCdnImages

      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.70,
        site: 'reddit'
      })
      if (cand) out.push(cand)
    }
  }

  return out
}

export function resolveRedditCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  try {
    if (!HOST_RE.test(location.hostname)) return []
  } catch { return [] }

  return dedupeCandidates([
    ...fromOgMeta(pageUrl, pageTitle),
    ...fromNewRedditMedia(pageUrl, pageTitle),
    ...fromOldRedditMedia(pageUrl, pageTitle),
    ...fromRedditCdnImages(pageUrl, pageTitle),
    ...fromRedditVideos(pageUrl, pageTitle),
    ...fromExternalImages(pageUrl, pageTitle),
  ])
}
