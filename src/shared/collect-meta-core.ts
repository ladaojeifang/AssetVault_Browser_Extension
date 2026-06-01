import type { CollectMeta } from './types'

export function absoluteUrl(src: string, base: string): string | null {
  try {
    return new URL(src, base).href
  } catch {
    return null
  }
}

export function filenameFromUrl(url: string): string | undefined {
  try {
    const name = new URL(url).pathname.split('/').pop()
    if (!name || !name.includes('.')) return undefined
    return decodeURIComponent(name)
  } catch {
    return undefined
  }
}

/** Build import payload from a raw media URL (no DOM). */
export function metaFromMediaUrl(
  rawUrl: string | undefined,
  pageUrl: string,
  pageTitle: string
): CollectMeta | null {
  if (!rawUrl?.trim()) return null
  const url = absoluteUrl(rawUrl.trim(), pageUrl)
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return null
  return {
    url,
    filename: filenameFromUrl(url),
    pageUrl,
    pageTitle
  }
}

/** Context menu `info` + tab title — works without content script. */
export function metaFromContextMenuInfo(
  info: { srcUrl?: string; linkUrl?: string; pageUrl?: string },
  tabTitle: string
): CollectMeta | null {
  const pageUrl = info.pageUrl?.trim() || ''
  if (!pageUrl) return null
  const raw = info.srcUrl || info.linkUrl
  return metaFromMediaUrl(raw, pageUrl, tabTitle || pageUrl)
}

export function isInjectableTabUrl(url: string | undefined): boolean {
  if (!url) return false
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}
