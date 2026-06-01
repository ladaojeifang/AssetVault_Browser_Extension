import type { CollectMeta } from './types'
import { absoluteUrl, filenameFromUrl } from './collect-meta-core'
import { scanPageMediaFull } from './page-media-scan'

function pickImageSrc(img: HTMLImageElement): string | null {
  const src = img.currentSrc || img.getAttribute('src') || ''
  if (!src || src.startsWith('data:') || src.startsWith('blob:')) return null
  return src
}

export function metaFromImage(img: HTMLImageElement, pageUrl: string, pageTitle: string): CollectMeta | null {
  const raw = pickImageSrc(img)
  if (!raw) return null
  const url = absoluteUrl(raw, pageUrl)
  if (!url) return null
  return {
    url,
    filename: filenameFromUrl(url),
    pageUrl,
    pageTitle,
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height
  }
}

export function metaFromVideo(video: HTMLVideoElement, pageUrl: string, pageTitle: string): CollectMeta | null {
  const raw = video.currentSrc || video.src
  if (!raw || raw.startsWith('blob:')) return null
  const url = absoluteUrl(raw, pageUrl)
  if (!url) return null
  return {
    url,
    filename: filenameFromUrl(url),
    pageUrl,
    pageTitle,
    width: video.videoWidth,
    height: video.videoHeight
  }
}

export function metaFromBackground(el: HTMLElement, pageUrl: string, pageTitle: string): CollectMeta | null {
  const bg = getComputedStyle(el).backgroundImage
  if (!bg || bg === 'none' || !bg.includes('url(')) return null
  const m = bg.match(/url\(["']?([^"')]+)["']?\)/)
  if (!m?.[1]) return null
  const url = absoluteUrl(m[1], pageUrl)
  if (!url || url.startsWith('data:')) return null
  return {
    url,
    filename: filenameFromUrl(url),
    pageUrl,
    pageTitle
  }
}

export function findCollectableFromEventTarget(
  target: EventTarget | null,
  pageUrl: string,
  pageTitle: string
): CollectMeta | null {
  if (!(target instanceof Element)) return null
  const img = target.closest('img')
  if (img instanceof HTMLImageElement) return metaFromImage(img, pageUrl, pageTitle)
  const video = target.closest('video')
  if (video instanceof HTMLVideoElement) return metaFromVideo(video, pageUrl, pageTitle)
  if (target instanceof HTMLElement) return metaFromBackground(target, pageUrl, pageTitle)
  return null
}

/** Multi-source batch scan (async: may expand preview + HD). */
export function scanPageMedia(pageUrl: string, pageTitle: string): Promise<CollectMeta[]> {
  return scanPageMediaFull(pageUrl, pageTitle)
}
