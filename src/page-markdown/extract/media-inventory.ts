import { enlargeImageUrl } from '../../shared/url-enlarger'
import { assignPlaceholderPaths, replaceMediaPaths } from './media-path-replace'

export { assignPlaceholderPaths, replaceMediaPaths } from './media-path-replace'

export interface MediaItem {
  originalUrl: string
  /** URLs to rewrite in Markdown when download succeeds (preview, HD, lazy attrs). */
  replaceUrls: string[]
  highResUrl: string
  tagName: string // 'IMG' | 'VIDEO' | 'SOURCE'
  type: 'image' | 'video'
  extension: string
  placeholderRelativePath?: string // e.g. './assets/img-001.jpg'
}

export interface MediaInventoryResult {
  mediaList: MediaItem[]
}

export function getExtensionFromUrl(url: string, defaultExt: string): string {
  try {
    const pathname = new URL(url).pathname
    const ext = pathname.split('.').pop()?.toLowerCase()
    if (ext && ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'webm'].includes(ext)) {
      if (ext === 'jpeg') return 'jpg'
      return ext
    }
  } catch {
    // ignore invalid URL
  }
  return defaultExt
}

/** @deprecated Use scanMainColumnMedia — kept for tests that only need HTML video scan. */
export async function scanMedia(htmlString: string, baseUrl: string): Promise<MediaInventoryResult> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(htmlString, 'text/html')

  const mediaList: MediaItem[] = []
  const urlSet = new Set<string>()
  const promises: Promise<void>[] = []

  const imgs = doc.querySelectorAll('img')
  imgs.forEach((img) => {
    let src = img.getAttribute('src') || img.getAttribute('data-src') || ''
    if (!src) return
    try {
      src = new URL(src, baseUrl).href
    } catch {
      return
    }
    if (urlSet.has(src)) return
    urlSet.add(src)
    promises.push((async () => {
      const highRes = await enlargeImageUrl(src)
      mediaList.push({
        originalUrl: src,
        replaceUrls: [src, highRes],
        highResUrl: highRes,
        tagName: 'IMG',
        type: 'image',
        extension: getExtensionFromUrl(highRes, 'jpg'),
      })
    })())
  })

  const videos = doc.querySelectorAll('video, source')
  videos.forEach((vid) => {
    let src = vid.getAttribute('src') || ''
    if (!src) return
    try {
      src = new URL(src, baseUrl).href
    } catch {
      return
    }
    if (urlSet.has(src)) return
    urlSet.add(src)
    promises.push((async () => {
      mediaList.push({
        originalUrl: src,
        replaceUrls: [src],
        highResUrl: src,
        tagName: vid.tagName,
        type: 'video',
        extension: getExtensionFromUrl(src, 'mp4'),
      })
    })())
  })

  await Promise.all(promises)
  assignPlaceholderPaths(mediaList)
  return { mediaList }
}
