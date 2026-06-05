import { resolveVideoPageContext, type VideoPageContext } from './video-page-url-rules'

export function isTikTokVmShortUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim())
    return u.hostname === 'vm.tiktok.com' && u.pathname.length > 1
  } catch {
    return false
  }
}

/** Follow redirects and return the final response URL (extension pages / SW). */
export async function followHttpRedirectUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url.trim(), { method: 'GET', redirect: 'follow', credentials: 'omit' })
    return res.url || null
  } catch {
    return null
  }
}

/** Sync rules first; TikTok `vm.tiktok.com` short links resolve via redirect then re-parse. */
export async function resolveVideoPageContextAsync(raw: string): Promise<VideoPageContext | null> {
  const direct = resolveVideoPageContext(raw)
  if (direct) return direct
  if (!isTikTokVmShortUrl(raw)) return null
  const finalUrl = await followHttpRedirectUrl(raw)
  if (!finalUrl) return null
  return resolveVideoPageContext(finalUrl)
}
