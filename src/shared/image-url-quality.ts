/** Pure URL scoring / filtering for image download (no DOM or fetch deps). */

export function isPlaceholderImageSrc(raw: string): boolean {
  return /^data:image\/(gif|svg)/i.test(raw) || /^data:image\/;base64/i.test(raw)
}

export function isNoiseImageUrl(url: string): boolean {
  if (/pixel|tracking|analytics|spacer|1x1|favicon|logo\.(?:png|svg)/i.test(url)) return true
  if (/avatar|profile_images|profile_banners|\/emoji\//i.test(url)) return true
  if (/ads?\.|doubleclick|googlesyndication|google-analytics|bat\.bing/i.test(url)) return true
  const filename = (url.split('/').pop() || '').toLowerCase()
  if (/\b(thumb|preview|mini|sprite|avatar|logo|badge|favicon|icon)(\.[a-z]+)?$/i.test(filename)) {
    return true
  }
  if (url.includes('placeholder')) return true
  return false
}

/** Drop site branding / hotlink placeholder hosts (e.g. pc528 官网水印图). */
export function isOffArticleCdnImage(url: string, pageUrl: string): boolean {
  if (!/pc528\.net|pc520\.net/i.test(pageUrl)) return false
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (/^(.+\.)?pc528\.net$/i.test(host)) return true
    if (/pc520\.net$/i.test(host) && !/\/wp-content\/uploads\//i.test(url)) return true
  } catch {
    return false
  }
  return false
}

export function isArticleImageUrl(url: string, pageUrl: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false
  if (isNoiseImageUrl(url)) return false
  if (isOffArticleCdnImage(url, pageUrl)) return false
  return true
}

/** Higher = prefer for download. */
export function imageUrlQualityScore(url: string): number {
  let s = 0
  if (/name=orig|original|\/originals\/|_b\.jpg|max_1200|w=\d{4,}/i.test(url)) s += 40
  if (/\/wp-content\/uploads\//i.test(url) && !/-\d+x\d+\./i.test(url)) s += 25
  if (/mmbiz\.qpic|qpic\.cn/i.test(url)) s += 15
  if (/[?&]wx_fmt=/i.test(url)) s += 5
  if (/-\d+x\d+\./i.test(url) || /[?&]w=\d{1,3}(?:&|$)/i.test(url)) s -= 35
  if (/name=small|name=thumb|thumb|mini|sprite|icon|_xs\.|_s\./i.test(url)) s -= 30
  try {
    const path = new URL(url).pathname
    if (path.length > 20) s += 5
  } catch {
    /* ignore */
  }
  return s
}

export function pickBestImageUrl(
  candidates: Iterable<string>,
  pageUrl = '',
): string | null {
  let best: string | null = null
  let bestScore = -Infinity
  for (const raw of candidates) {
    const u = raw?.trim()
    if (!u || !isArticleImageUrl(u, pageUrl)) continue
    const score = imageUrlQualityScore(u)
    if (score > bestScore) {
      bestScore = score
      best = u
    }
  }
  return best
}
