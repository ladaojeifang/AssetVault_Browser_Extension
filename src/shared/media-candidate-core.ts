import type { MediaCandidate, MediaSite, MediaSourceType } from './types'

const VIDEO_EXT_RE = /\.(mp4|webm|m4v|mov|mkv)(\?|#|$)/i
const GIF_EXT_RE = /\.(gif|gifv)(\?|#|$)/i
const HLS_EXT_RE = /\.m3u8(\?|#|$)/i

export function toAbsoluteUrl(raw: string, base: string): string | null {
  const v = raw.trim()
  if (!v) return null
  try {
    return new URL(v, base).href
  } catch {
    return null
  }
}

export function inferSourceType(url: string, mime?: string): MediaSourceType | null {
  const lowerMime = (mime || '').toLowerCase()
  let parsed: URL | null = null
  try {
    parsed = new URL(url)
  } catch {
    parsed = null
  }
  const queryMime = (parsed?.searchParams.get('mime') || '').toLowerCase()
  const host = (parsed?.hostname || '').toLowerCase()
  const path = (parsed?.pathname || '').toLowerCase()
  const queryText = (parsed?.search || '').toLowerCase()

  if (HLS_EXT_RE.test(url) || lowerMime.includes('application/vnd.apple.mpegurl')) {
    return 'hls_manifest'
  }
  if (
    queryText.includes('.m3u8') ||
    queryMime.includes('mpegurl') ||
    queryMime.includes('x-mpegurl')
  ) {
    return 'hls_manifest'
  }
  if (
    VIDEO_EXT_RE.test(url) ||
    GIF_EXT_RE.test(url) ||
    lowerMime.startsWith('video/') ||
    lowerMime === 'image/gif' ||
    queryMime.startsWith('video/') ||
    queryMime === 'image/gif'
  ) {
    return 'direct_file'
  }
  // Site-specific no-extension URLs commonly used by stream endpoints.
  if (host.endsWith('googlevideo.com') && path.includes('videoplayback')) return 'direct_file'
  if (host.endsWith('video.twimg.com')) {
    if (path.includes('.m3u8') || queryText.includes('m3u8')) return 'hls_manifest'
    if (path.includes('/ext_tw_video/') || path.includes('/amplify_video/')) return 'direct_file'
  }
  if (host.endsWith('twimg.com') && (path.includes('/ext_tw_video/') || path.includes('/amplify_video/'))) {
    return 'direct_file'
  }
  if (host.includes('bilivideo.com')) return 'direct_file'
  return null
}

export function inferKind(url: string, mime?: string): 'video' | 'gif' {
  const lowerMime = (mime || '').toLowerCase()
  if (GIF_EXT_RE.test(url) || lowerMime === 'image/gif') return 'gif'
  return 'video'
}

export function inferFilename(url: string): string | undefined {
  try {
    const p = new URL(url).pathname
    const name = p.split('/').pop()
    if (!name || !name.includes('.')) return undefined
    return decodeURIComponent(name)
  } catch {
    return undefined
  }
}

export function makeMediaCandidate(input: {
  url: string
  pageUrl: string
  pageTitle: string
  mime?: string
  duration?: number
  referer?: string
  site?: MediaSite
  confidence?: number
  filename?: string
}): MediaCandidate | null {
  if (!/^https?:\/\//.test(input.url)) return null
  if (input.url.startsWith('blob:') || input.url.startsWith('data:')) return null
  const sourceType = inferSourceType(input.url, input.mime)
  if (!sourceType) return null

  return {
    kind: inferKind(input.url, input.mime),
    sourceType,
    url: input.url,
    filename: input.filename ?? inferFilename(input.url),
    mime: input.mime,
    duration: input.duration,
    referer: input.referer,
    pageUrl: input.pageUrl,
    pageTitle: input.pageTitle,
    site: input.site ?? 'generic',
    confidence: Math.max(0, Math.min(1, input.confidence ?? 0.5))
  }
}

export function dedupeCandidates(input: MediaCandidate[]): MediaCandidate[] {
  const byUrl = new Map<string, MediaCandidate>()
  for (const row of input) {
    const existing = byUrl.get(row.url)
    if (!existing || row.confidence > existing.confidence) {
      byUrl.set(row.url, row)
    }
  }
  return Array.from(byUrl.values()).sort((a, b) => b.confidence - a.confidence)
}
