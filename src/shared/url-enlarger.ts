/**

 * URL rewrite: thumbnail/CDN URLs → higher-resolution candidates.

 * Site-specific logic lives in `url-enlarger-site-rules.ts` (AssetVault-native).

 */

import { URL_ENLARGE_SITE_RULES, type UrlEnlargeRule } from './url-enlarger-site-rules'



export type { UrlEnlargeRule }



function isTwitterMediaUrl(url: string): boolean {

  return /twimg\.com/i.test(url) && /\/media\//i.test(url)

}



/** Infer format=jpg|png|webp for pbs.twimg.com/media URLs (orig requires matching format). */

function inferTwitterMediaFormat(url: URL, raw: string): string {

  const fromQuery = url.searchParams.get('format')?.toLowerCase()

  if (fromQuery) return fromQuery === 'jpeg' ? 'jpg' : fromQuery

  const pathExt = url.pathname.match(/\.(jpe?g|png|webp|gif)$/i)

  if (pathExt) {

    const e = pathExt[1].toLowerCase()

    return e === 'jpeg' ? 'jpg' : e

  }

  const rawExt = raw.match(/\.(jpe?g|png|webp|gif)(\?|#|$)/i)

  if (rawExt) {

    const e = rawExt[1].toLowerCase()

    return e === 'jpeg' ? 'jpg' : e

  }

  return 'jpg'

}



/**

 * Canonical tweet media URL: https://pbs.twimg.com/media/{id}?format=jpg&name=orig

 */

export function buildTwitterOrigMediaUrl(url: string): string | null {

  if (!isTwitterMediaUrl(url)) return null

  try {

    const u = new URL(url)

    const idMatch = u.pathname.match(/\/media\/([^/]+)/i)

    if (!idMatch) return null

    const mediaId = idMatch[1].replace(/\.(jpe?g|png|webp|gif)$/i, '')

    const format = inferTwitterMediaFormat(u, url)

    return `https://pbs.twimg.com/media/${mediaId}?format=${format}&name=orig`

  } catch {

    return null

  }

}



function enlargeTwitter(url: string): string {

  if (!url.includes('twimg.com')) return url

  const orig = buildTwitterOrigMediaUrl(url)

  if (orig) return orig

  if (/name=orig\b/i.test(url)) return url

  if (/name=\w+/i.test(url)) return url.replace(/name=\w+/i, 'name=orig')

  try {

    const u = new URL(url)

    if (!u.searchParams.get('format')) {

      u.searchParams.set('format', inferTwitterMediaFormat(u, url))

    }

    u.searchParams.set('name', 'orig')

    return u.toString()

  } catch {

    return url

  }

}



/** Extra download candidates for one tweet media URL (orig + common fallbacks). */

export function twitterMediaCandidateUrls(url: string): string[] {

  const high: string[] = []

  const low: string[] = []

  const seen = new Set<string>()

  const pushHigh = (u: string | null | undefined) => {

    if (!u || seen.has(u)) return

    seen.add(u)

    high.push(u)

  }

  const pushLow = (u: string | null | undefined) => {

    if (!u || seen.has(u)) return

    seen.add(u)

    low.push(u)

  }



  const orig = buildTwitterOrigMediaUrl(url)

  pushHigh(orig)

  pushHigh(enlargeTwitter(url))



  if (orig) {

    try {

      const u = new URL(orig)

      const mediaId = u.pathname.match(/\/media\/([^/]+)/i)?.[1]

      const format = u.searchParams.get('format') || 'jpg'

      if (mediaId) {

        pushHigh(`https://pbs.twimg.com/media/${mediaId}.${format}?name=orig`)

        pushHigh(`https://pbs.twimg.com/media/${mediaId}?format=${format}&name=large`)

        pushHigh(`https://pbs.twimg.com/media/${mediaId}?format=${format}&name=4096x4096`)

      }

    } catch {

      /* ignore */

    }

  }



  const raw = url.trim()

  if (raw && !seen.has(raw)) {

    if (/[?&]name=(?:small|medium|thumb|mini|360x360)\b/i.test(raw)) {

      pushLow(raw)

    } else if (!/name=orig\b/i.test(raw)) {

      pushLow(raw)

    }

  }



  return [...high, ...low]

}



export function isLowResTwitterMediaUrl(url: string): boolean {

  return /twimg\.com\/media\//i.test(url) && /[?&]name=(?:small|medium|thumb|mini|360x360)\b/i.test(url)

}



const TWITTER_RULE: UrlEnlargeRule = {

  site: 'Twitter',

  test: (u) => /twimg\.com/i.test(u),

  enlarge: enlargeTwitter

}



/** All site rules including X/Twitter (for `isEnlargeableUrl`). */

export const URL_ENLARGE_RULES: UrlEnlargeRule[] = [...URL_ENLARGE_SITE_RULES, TWITTER_RULE]



export function isEnlargeableUrl(url: string): boolean {

  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return false

  return URL_ENLARGE_RULES.some((r) => r.test(url))

}



export async function enlargeImageUrl(url: string): Promise<string> {

  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return url



  if (isTwitterMediaUrl(url)) {

    const orig = buildTwitterOrigMediaUrl(url)

    if (orig) return orig

    const tw = enlargeTwitter(url)

    if (tw && tw !== url) return tw

  }



  for (const rule of URL_ENLARGE_SITE_RULES) {

    if (!rule.test(url)) continue

    const next = await rule.enlarge(url)

    if (next && next !== url) return next

  }



  if (TWITTER_RULE.test(url)) {

    const next = await TWITTER_RULE.enlarge(url)

    if (next && next !== url) return next

  }



  return url

}


