import { enlargeImageUrl } from '../../shared/url-enlarger'

export interface MediaItem {
  originalUrl: string
  highResUrl: string
  tagName: string // 'IMG' | 'VIDEO' | 'SOURCE'
  type: 'image' | 'video'
  extension: string
  placeholderRelativePath?: string // e.g. './assets/img-001.jpg'
}

export interface MediaInventoryResult {
  mediaList: MediaItem[]
}

function getExtensionFromUrl(url: string, defaultExt: string): string {
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

export async function scanMedia(htmlString: string, baseUrl: string): Promise<MediaInventoryResult> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(htmlString, 'text/html')
  
  const mediaList: MediaItem[] = []
  const urlSet = new Set<string>()
  const promises: Promise<void>[] = []

  // Images
  const imgs = doc.querySelectorAll('img')
  imgs.forEach(img => {
    let src = img.getAttribute('src') || img.getAttribute('data-src') || ''
    if (!src) return

    // Resolve relative to absolute
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
        highResUrl: highRes,
        tagName: 'IMG',
        type: 'image',
        extension: getExtensionFromUrl(highRes, 'jpg')
      })
    })())
  })

  // Videos
  const videos = doc.querySelectorAll('video, source')
  videos.forEach(vid => {
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
        highResUrl: src, // No enlarge logic for video currently
        tagName: vid.tagName,
        type: 'video',
        extension: getExtensionFromUrl(src, 'mp4')
      })
    })())
  })

  await Promise.all(promises)

  // Assign relative paths
  let imgCount = 0
  let vidCount = 0
  mediaList.forEach(m => {
    if (m.type === 'image') {
      imgCount++
      m.placeholderRelativePath = `./assets/img-${String(imgCount).padStart(3, '0')}.${m.extension}`
    } else {
      vidCount++
      m.placeholderRelativePath = `./assets/vid-${String(vidCount).padStart(3, '0')}.${m.extension}`
    }
  })

  return { mediaList }
}

export function replaceMediaPaths(markdown: string, mediaList: MediaItem[], successfulOriginalUrls: Set<string>): string {
  let finalMd = markdown

  // Sort by length descending to avoid partial substring replacements (e.g. replacing 'http://a.com/1' inside 'http://a.com/12')
  const sorted = [...mediaList].sort((a, b) => b.originalUrl.length - a.originalUrl.length)

  for (const m of sorted) {
    if (successfulOriginalUrls.has(m.originalUrl) && m.placeholderRelativePath) {
      // Escape for regex
      const escapedUrl = m.originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(escapedUrl, 'g')
      finalMd = finalMd.replace(regex, m.placeholderRelativePath)
    }
  }

  return finalMd
}
