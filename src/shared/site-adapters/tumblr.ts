import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const HOST_RE = /tumblr\.com/i

const TUMBLR_MEDIA_RE = /\.media\.tumblr\.com|^https?:\/\/\w+\.tumblr\.com\/image/i

/**
 * Tumblr image URLs contain a size number before extension:
 * https://XX.tumblr.com/XXXXX/tumblr_XXXX_1280.jpg
 * Replace the size number with 2048 to attempt getting higher resolution.
 */
function maximizeTumblrResolution(url: string): string {
  // Match pattern: _{number}.{ext} near end of URL
  const match = url.match(/_(\d+)\.(jpg|jpeg|png|gif)(\?|#|$)/i)
  if (match) {
    const size = parseInt(match[1], 10)
    if (size < 2048) {
      return url.replace(match[0], `_2048.${match[2]}`)
    }
  }
  return url
}

function fromOgImage(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // Tumblr typically provides high-quality og:image
  for (const prop of ['og:image', 'og:image:url', 'og:video', 'og:video:url']) {
    const content =
      document.querySelector(`meta[property="${prop}"]`)?.getAttribute('content') ||
      document.querySelector(`meta[name="${prop}"]`)?.getAttribute('content') ||
      ''
    if (!content) continue
    const abs = toAbsoluteUrl(content, pageUrl)
    if (!abs) continue
    const isVideo = prop.includes('video')
    const maxed = isVideo ? abs : maximizeTumblrResolution(abs)
    const cand = makeMediaCandidate({
      url: maxed,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: isVideo ? 0.89 : 0.90,
      site: 'tumblr'
    })
    if (cand) out.push(cand)
  }
  // Twitter card meta tags Tumblr also uses
  for (const name of ['twitter:image', 'twitter:image:src', 'twitter:player:stream']) {
    const content = document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') || ''
    if (!content) continue
    const abs = toAbsoluteUrl(content, pageUrl)
    if (!abs) continue
    const maxed = name.includes('player') ? abs : maximizeTumblrResolution(abs)
    const cand = makeMediaCandidate({
      url: maxed,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: name.includes('player') ? 0.86 : 0.87,
      site: 'tumblr'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromPostContentImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // Tumblr post content areas containing photos
  const selectors = [
    '.post_content img',
    '.post-body img',
    '.photo img',
    'figure img',
    '.photoset img',
    '.post_media img',
    '[data-media] img',
    '.native_photo img',
    'article img[src*="tumblr"]',
  ]

  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(sel))) {
      const src = img.getAttribute('src') || img.dataset.src || img.dataset.originalSrc || ''
      if (!src) continue
      // Skip avatars, icons, UI decorations
      if (img.classList.contains('avatar') || src.includes('avatar')) continue
      if (src.includes('tumblr_vor') && src.includes('avatar')) continue
      if (src.includes('tumblr_inline_') && img.width > 1 && img.width < 30) continue

      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const maxed = maximizeTumblrResolution(abs)

      // Determine confidence based on image apparent size
      const w = img.naturalWidth || img.width || 0
      const isLarge = w >= 300
      const cand = makeMediaCandidate({
        url: maxed,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: isLarge ? 0.91 : 0.73,
        site: 'tumblr'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromTumblrCdnImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // Catch all Tumblr CDN images across the page
  for (const img of Array.from(document.querySelectorAll<HTMLImageElement>('img'))) {
    const src = img.getAttribute('src') || ''
    if (!TUMBLR_MEDIA_RE.test(src) && !src.includes('tumblr.com') && !src.includes('.tumblr.com/')) continue

    // Filter out UI chrome
    if (src.includes('avatar') && !src.includes('post_media')) continue
    if (src.includes('/assets/images/') || src.includes('/packs/images/')) continue
    if (src.includes('tumblr_vor') && !src.includes('_1280') && !src.includes('_500') && !src.includes('_250')) continue

    const abs = toAbsoluteUrl(src, pageUrl)
    if (!abs) continue
    const maxed = maximizeTumblrResolution(abs)
    const cand = makeMediaCandidate({
      url: maxed,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.70,
      site: 'tumblr'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromPhotosetData(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // Photoset layouts embed data in JSON-LD-like structures or data attributes
  for (const ps of Array.from(document.querySelectorAll<HTMLImageElement>('[data-photoset-layout], .photoset-grid, [id*="photoset"]'))) {
    // Extract images from photoset
    for (const img of Array.from(ps.querySelectorAll('img'))) {
      const src = img.getAttribute('src') || img.dataset.src || ''
      if (!src) continue
      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const maxed = maximizeTumblrResolution(abs)

      const cand = makeMediaCandidate({
        url: maxed,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.93, // Photoset images are high-quality intent
        site: 'tumblr'
      })
      if (cand) out.push(cand)
    }

    // Check for data-image-json or similar
    const jsonData = (ps as HTMLElement).dataset.json || (ps as HTMLElement).dataset.images
    if (jsonData) {
      try {
        const parsed = JSON.parse(jsonData)
        const imgs = Array.isArray(parsed) ? parsed : [parsed]
        for (const entry of imgs) {
          const url = typeof entry === 'string' ? entry : ((entry as Record<string, unknown>).url as string) || ''
          if (!url) continue
          const abs = toAbsoluteUrl(url, pageUrl)
          if (!abs) continue
          const maxed = maximizeTumblrResolution(abs)
          const cand = makeMediaCandidate({
            url: maxed,
            pageUrl,
            pageTitle,
            referer: pageUrl,
            confidence: 0.92,
            site: 'tumblr'
          })
          if (cand) out.push(cand)
        }
      } catch { /* ignore */ }
    }
  }
  return out
}

function fromInitialState(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // Tumblr may embed __INITIAL_STATE__ with post media data
  for (const s of Array.from(document.querySelectorAll<HTMLImageElement>('script'))) {
    const txt = s.textContent || ''
    if (!txt.includes('__INITIAL_STATE__') && !txt.includes('__TUMBLR__')) continue

    // Look for tumblr media/image URLs
    const re = /https?:\/\/(?:\w+\.)*media\.tumblr\.com[^\s"'\\<>]*?(?:\d+)_[a-f0-9]+_\d+\.(?:jpg|jpeg|png|gif|webp)(\?[^\s"'\\<>]*)?/gi
    const hits = txt.match(re) || []
    const seen = new Set<string>()

    for (const hit of hits) {
      if (seen.has(hit)) continue
      seen.add(hit)
      if (hit.includes('avatar')) continue

      const abs = toAbsoluteUrl(hit, pageUrl)
      if (!abs) continue
      const maxed = maximizeTumblrResolution(abs)
      const cand = makeMediaCandidate({
        url: maxed,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.84,
        site: 'tumblr'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromTumblrVideos(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // Video elements in Tumblr posts
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
        confidence: 0.88,
        site: 'tumblr'
      })
      if (cand) out.push(cand)
    }
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
        confidence: 0.86,
        site: 'tumblr'
      })
      if (cand) out.push(cand)
    }
  }

  // Tumblr also provides video poster/source via meta
  const videoContent = document.querySelector('meta[property="og:video"]')?.getAttribute('content') ||
                       document.querySelector('meta[name="twitter:player:stream"]')?.getAttribute('content') || ''
  if (videoContent) {
    const abs = toAbsoluteUrl(videoContent, pageUrl)
    if (abs) {
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.87,
        site: 'tumblr'
      })
      if (cand) out.push(cand)
    }
  }

  return out
}

export function resolveTumblrCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  try {
    if (!HOST_RE.test(location.hostname)) return []
  } catch { return [] }

  return dedupeCandidates([
    ...fromOgImage(pageUrl, pageTitle),
    ...fromPostContentImages(pageUrl, pageTitle),
    ...fromTumblrCdnImages(pageUrl, pageTitle),
    ...fromPhotosetData(pageUrl, pageTitle),
    ...fromInitialState(pageUrl, pageTitle),
    ...fromTumblrVideos(pageUrl, pageTitle),
  ])
}
