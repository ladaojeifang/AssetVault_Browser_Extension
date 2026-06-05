/**
 * WeChat articles render #js_content via JS; image URLs are also in
 * inline `picture_page_info_list` (cdn_url + width/height) before DOM paints.
 */

export type WechatPictureEntry = {
  url: string
  width: number
  height: number
}

const PICTURE_BLOCK_RE =
  /cdn_url:\s*'(https?:\/\/mmbiz\.qpic\.cn[^']+)'[\s\S]*?width:\s*'(\d+)'[\s\S]*?height:\s*'(\d+)'/gi

/** Parse `picture_page_info_list` blocks from raw script text. */
export function parseWechatPicturePageInfoFromText(txt: string): WechatPictureEntry[] {
  const out: WechatPictureEntry[] = []
  const seen = new Set<string>()
  if (!txt.includes('mmbiz.qpic')) return out

  PICTURE_BLOCK_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = PICTURE_BLOCK_RE.exec(txt)) !== null) {
    const url = m[1].replace(/\\x26/g, '&')
    const width = Number(m[2]) || 0
    const height = Number(m[3]) || 0
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push({ url, width, height })
  }
  return out
}

/** Parse article images from script tags (works before #js_content paints). */
export function parseWechatPicturePageInfoFromScripts(doc: Document = document): WechatPictureEntry[] {
  const out: WechatPictureEntry[] = []
  const seen = new Set<string>()

  for (const script of Array.from(doc.querySelectorAll('script'))) {
    const txt = script.textContent || ''
    if (!txt.includes('picture_page_info_list') && !txt.includes('mmbiz.qpic')) continue
    for (const row of parseWechatPicturePageInfoFromText(txt)) {
      if (seen.has(row.url)) continue
      seen.add(row.url)
      out.push(row)
    }
  }

  return out
}

/** Article photos (exclude watermark / icon rows with width 0). */
export function wechatArticlePhotos(minWidth = 400): WechatPictureEntry[] {
  return parseWechatPicturePageInfoFromScripts().filter(
    (p) => p.width >= minWidth && p.height >= minWidth * 0.5,
  )
}

export function supplementHtmlWithWechatImages(contentHtml: string, photos: WechatPictureEntry[]): string {
  if (!photos.length) return contentHtml
  const missing = photos.filter((p) => !contentHtml.includes(p.url.split('?')[0] || p.url))
  if (!missing.length) return contentHtml
  const imgs = missing.map((p) => `<p><img src="${p.url}" alt="" /></p>`).join('\n')
  return `${contentHtml}\n${imgs}`
}

/** Build main-column HTML when #js_content is still empty (SPA not painted yet). */
export function buildWechatFallbackArticleHtml(doc: Document = document): {
  contentHtml: string
  title: string
} | null {
  const photos = wechatArticlePhotos()
  if (!photos.length) return null

  let title = doc.querySelector('#activity-name')?.textContent?.trim() || doc.title || ''
  let bodyText = ''

  for (const script of Array.from(doc.querySelectorAll('script'))) {
    const txt = script.textContent || ''
    if (!title && txt.includes('msg_title')) {
      const mt = txt.match(/msg_title:\s*'((?:\\'|[^'])*)'/s)
      if (mt?.[1]) title = mt[1].replace(/\\'/g, "'").trim()
    }
    if (!bodyText && txt.includes('content_noencode')) {
      const mc = txt.match(/content_noencode:\s*'((?:\\'|[^'])*)'/s)
      if (mc?.[1]) {
        bodyText = mc[1]
          .replace(/\\n/g, '\n')
          .replace(/\\x0a/g, '\n')
          .replace(/\\'/g, "'")
          .trim()
      }
    }
  }

  if (!bodyText && photos.length < 3) return null

  const paragraphs = bodyText
    ? bodyText
        .split(/\n{2,}/)
        .map((p) => `<p>${escapeHtml(p.trim())}</p>`)
        .join('\n')
    : ''

  const imgs = photos.map((p) => `<p><img src="${p.url}" alt="" /></p>`).join('\n')
  const contentHtml = `<div id="js_content">${paragraphs}${imgs}</div>`

  return { contentHtml, title: title || '微信公众号文章' }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function waitForWechatArticleReady(
  mainSelector: string,
  options?: { minImages?: number; maxWaitMs?: number },
): Promise<void> {
  const minImages = options?.minImages ?? 3
  const maxWaitMs = options?.maxWaitMs ?? 12_000
  const stepMs = 280
  const start = Date.now()

  while (Date.now() - start < maxWaitMs) {
    const fromData = wechatArticlePhotos()
    if (fromData.length >= minImages) return

    const root = document.querySelector(mainSelector)
    if (root instanceof HTMLElement) {
      const textLen = (root.textContent || '').trim().length
      const imgs = root.querySelectorAll(
        'img[data-src*="mmbiz"], img[src*="mmbiz"], img[data-src*="qpic"]',
      )
      if (textLen >= 200 && imgs.length >= minImages) return
    }

    await new Promise((r) => setTimeout(r, stepMs))
  }
}
