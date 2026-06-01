import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

function fromMetaTags(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []

  // Video meta tag (for shots with video)
  const videoContent =
    document.querySelector('meta[property="og:video"]')?.getAttribute('content')
    || document.querySelector('meta[name="video:secure_url"]')?.getAttribute('content')
    || ''
  if (videoContent) {
    const abs = toAbsoluteUrl(videoContent, pageUrl)
    if (abs) {
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.86,
        site: 'dribbble'
      })
      if (cand) out.push(cand)
    }
  }

  // Image meta tag
  const imageContent =
    document.querySelector('meta[property="og:image"]')?.getAttribute('content')
    || document.querySelector('meta[name="twitter:image"]')?.getAttribute('content')
    || ''
  if (imageContent) {
    const abs = toAbsoluteUrl(imageContent, pageUrl)
    if (abs) {
      const isGif = /\.gif/i.test(abs)
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: isGif ? 0.9 : 0.82,
        site: 'dribbble'
      })
      if (cand) out.push(cand)
    }
  }

  return out
}

function fromShotMedia(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []

  // Shot images
  for (const img of Array.from(
    document.querySelectorAll<HTMLImageElement>('.shot-media img, img[src*="cdn.dribbble.com"]'),
  )) {
    const src = img.getAttribute('src') || img.currentSrc || ''
    if (!src || src.startsWith('data:')) continue
    const abs = toAbsoluteUrl(src, pageUrl)
    if (!abs) continue
    const isGif = /\.gif/i.test(abs)
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: isGif ? 0.92 : 0.8,
      site: 'dribbble'
    })
    if (cand) out.push(cand)
  }

  // Shot videos (GIF-as-video or MP4 shots)
  for (const video of Array.from(
    document.querySelectorAll<HTMLVideoElement>('.shot-media video, .gif-player video'),
  )) {
    for (const src of [video.currentSrc, video.src]) {
      const abs = toAbsoluteUrl(src || '', pageUrl)
      if (!abs) continue
      const isGif = /\.gif/i.test(abs)
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        duration: Number.isFinite(video.duration) ? video.duration : undefined,
        confidence: isGif ? 0.9 : 0.84,
        site: 'dribbble'
      })
      if (cand) out.push(cand)
    }
    // Source elements within video tag
    for (const source of Array.from(video.querySelectorAll('source'))) {
      const src = source.getAttribute('src') || ''
      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const isGif = /\.gif/i.test(abs)
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: isGif ? 0.88 : 0.82,
        site: 'dribbble'
      })
      if (cand) out.push(cand)
    }
  }

  return out
}

function fromDribbbleScript(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const cdnRe = /https?:\/\/cdn\.dribbble\.com[^\s"'\\]+?\.(?:mp4|gif|png|jpg|jpeg|webp)(\?[^\s"'\\]*)?/gi
  for (const s of Array.from(document.querySelectorAll<HTMLImageElement>('script'))) {
    const txt = s.textContent || ''
    if (!txt) continue
    const hits = txt.match(cdnRe) || []
    for (const hit of hits) {
      const abs = toAbsoluteUrl(hit, pageUrl)
      if (!abs) continue
      const isGif = /\.gif/i.test(abs)
      const isVideo = /\.mp4/i.test(abs)
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: isGif ? 0.86 : isVideo ? 0.83 : 0.72,
        site: 'dribbble'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

export function resolveDribbbleCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  if (!/dribbble\.com/i.test(location.hostname)) return []
  return dedupeCandidates([
    ...fromMetaTags(pageUrl, pageTitle),
    ...fromShotMedia(pageUrl, pageTitle),
    ...fromDribbbleScript(pageUrl, pageTitle)
  ])
}
