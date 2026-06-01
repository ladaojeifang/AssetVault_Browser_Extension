/** Fetch X/Twitter status media from syndication / mirror APIs (runs in extension context). */

export function parseXStatusUrl(
  pageUrl: string
): { screenName: string; statusId: string } | null {
  try {
    const u = new URL(pageUrl)
    const host = u.hostname.toLowerCase()
    if (!host.includes('twitter.com') && host !== 'x.com' && !host.endsWith('.x.com')) {
      return null
    }
    const m = u.pathname.match(/^\/([^/]+)\/status\/(\d+)/i)
    if (!m) return null
    return { screenName: m[1], statusId: m[2] }
  } catch {
    return null
  }
}

export function isXPageUrl(pageUrl: string): boolean {
  return parseXStatusUrl(pageUrl) !== null || /x\.com|twitter\.com/i.test(pageUrl)
}

export type XStatusPhoto = {
  mediaKey: string
  hdUrl: string
  previewUrl?: string
  width?: number
  height?: number
}

function syndicationToken(statusId: string): string {
  return ((Number(statusId) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '')
}

export function twitterMediaKeyFromUrl(url: string): string | null {
  const m = url.match(/pbs\.twimg\.com\/media\/([A-Za-z0-9_-]+)/i)
  return m ? m[1].replace(/\.(jpe?g|png|webp|gif)$/i, '') : null
}

function inferFormat(key: string, url: string): string {
  const m = url.match(/\.(jpe?g|png|webp|gif)(\?|#|$)/i)
  if (m) {
    const e = m[1].toLowerCase()
    return e === 'jpeg' ? 'jpg' : e
  }
  return 'jpg'
}

/** Canonical orig URL for import. */
export function toTwitterOrigUrl(urlOrKey: string, format = 'jpg'): string {
  const key = urlOrKey.includes('/')
    ? twitterMediaKeyFromUrl(urlOrKey)
    : urlOrKey.replace(/\.(jpe?g|png|webp|gif)$/i, '')
  if (!key) return urlOrKey
  const fmt = urlOrKey.includes('/') ? inferFormat(key, urlOrKey) : format
  return `https://pbs.twimg.com/media/${key}?format=${fmt}&name=orig`
}

export function toTwitterPreviewUrl(key: string, format = 'jpg'): string {
  return `https://pbs.twimg.com/media/${key}?format=${format}&name=small`
}

function photoFromUrl(raw: string, width?: number, height?: number): XStatusPhoto | null {
  const mediaKey = twitterMediaKeyFromUrl(raw)
  if (!mediaKey) return null
  const hdUrl = toTwitterOrigUrl(raw)
  const previewUrl = /[?&]name=(?:small|medium|thumb)\b/i.test(raw)
    ? raw
    : toTwitterPreviewUrl(mediaKey)
  return { mediaKey, hdUrl, previewUrl, width, height }
}

function mergePhotos(list: XStatusPhoto[]): XStatusPhoto[] {
  const map = new Map<string, XStatusPhoto>()
  for (const p of list) {
    const prev = map.get(p.mediaKey)
    if (!prev) {
      map.set(p.mediaKey, { ...p })
      continue
    }
    if (p.width) prev.width = p.width
    if (p.height) prev.height = p.height
    if (p.hdUrl) prev.hdUrl = p.hdUrl
    if (p.previewUrl && /name=(?:small|medium)/i.test(p.previewUrl)) {
      prev.previewUrl = p.previewUrl
    }
  }
  return [...map.values()]
}

function collectKeysFromJson(node: unknown, keys: Set<string>): void {
  const walk = (v: unknown): void => {
    if (!v) return
    if (typeof v === 'string') {
      const re = /pbs\.twimg\.com\/media\/([A-Za-z0-9_-]+)/gi
      for (const m of v.matchAll(re)) {
        const k = m[1].replace(/\.(jpe?g|png|webp|gif)$/i, '')
        if (k.length >= 5 && !/profile_images|profile_banners/i.test(m[0])) keys.add(k)
      }
      return
    }
    if (Array.isArray(v)) {
      for (const x of v) walk(x)
      return
    }
    if (typeof v === 'object') {
      for (const x of Object.values(v as Record<string, unknown>)) walk(x)
    }
  }
  walk(node)
}

async function fetchSyndicationPhotos(statusId: string): Promise<XStatusPhoto[]> {
  const token = syndicationToken(statusId)
  const resp = await fetch(
    `https://cdn.syndication.twimg.com/tweet-result?id=${statusId}&token=${token}`,
    { credentials: 'omit', cache: 'no-store' }
  )
  if (!resp.ok) return []
  const data = await resp.json()
  const keys = new Set<string>()
  collectKeysFromJson(data, keys)
  return [...keys].map((mediaKey) => ({
    mediaKey,
    hdUrl: toTwitterOrigUrl(mediaKey),
    previewUrl: toTwitterPreviewUrl(mediaKey)
  }))
}

async function fetchFxTwitterPhotos(screenName: string, statusId: string): Promise<XStatusPhoto[]> {
  const resp = await fetch(
    `https://api.fxtwitter.com/${encodeURIComponent(screenName)}/status/${statusId}`,
    { credentials: 'omit', cache: 'no-store' }
  )
  if (!resp.ok) return []
  const data = (await resp.json()) as {
    tweet?: {
      media?: {
        photos?: Array<{ url?: string; width?: number; height?: number }>
        all?: Array<{ url?: string; width?: number; height?: number }>
      }
      quote?: { media?: { photos?: Array<{ url?: string; width?: number; height?: number }> } }
    }
  }
  const out: XStatusPhoto[] = []
  const pushList = (list: Array<{ url?: string; width?: number; height?: number }> | undefined) => {
    for (const p of list ?? []) {
      if (!p.url) continue
      const row = photoFromUrl(p.url, p.width, p.height)
      if (row) out.push(row)
    }
  }
  pushList(data.tweet?.media?.photos)
  pushList(data.tweet?.media?.all)
  pushList(data.tweet?.quote?.media?.photos)
  return mergePhotos(out)
}

/** Resolve tweet photos with dimensions (extension background). */
export async function fetchXStatusPhotos(pageUrl: string): Promise<XStatusPhoto[]> {
  const parsed = parseXStatusUrl(pageUrl)
  if (!parsed) return []

  const { screenName, statusId } = parsed
  let photos: XStatusPhoto[] = []

  try {
    photos = await fetchFxTwitterPhotos(screenName, statusId)
  } catch {
    /* ignore */
  }

  if (!photos.length) {
    try {
      photos = await fetchSyndicationPhotos(statusId)
    } catch {
      /* ignore */
    }
  }

  return photos
}

/** @deprecated Use fetchXStatusPhotos — returns HD URLs only. */
export async function fetchXStatusMediaUrls(pageUrl: string): Promise<string[]> {
  return (await fetchXStatusPhotos(pageUrl)).map((p) => p.hdUrl)
}
