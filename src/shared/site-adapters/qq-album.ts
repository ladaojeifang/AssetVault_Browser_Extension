import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const HOST_RE = /photo\.qq\.com|i\.qq\.com.*photo/i

/** QQ相册 CDN 图片域名 */
const QQ_ALBUM_CDN_RE = /gqd\.qpic\.cn|photos\.bce\.baidu\.com|[^/]*qpic\.cn/i

/**
 * 尝试将QQ相册缩略图URL转换为大图URL。
 * QQ相册的图片URL通常包含尺寸参数，如 /xxx/xxx_300x0.jpg，
 * 替换为更大尺寸或去掉尺寸限制。
 */
function enlargeQqImageUrl(raw: string): string {
  let url = raw
  // 常见的QQ相册缩略图尺寸模式
  const sizePatterns = [
    /_\d+x0(?=\.[a-z]+$)/i,
    /_\d+_\d+(?=\.[a-z]+$)/i,
    /\/\d+\/[a-z]_(?=\w+\.\w+$)/i,
    /\?boothType=\d+/i,
  ]
  for (const pat of sizePatterns) {
    if (pat.test(url)) {
      url = url.replace(pat, '')
      break
    }
  }
  return url
}

function fromPhotoListElements(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    '.photo-list img',
    '.photo-box img',
    '.album-photo img',
    '.photo-item img',
    '.photo_img img',
    '#albumList img',
    '.show-img-list img',
  ]

  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(sel))) {
      const src =
        img.src ||
        img.getAttribute('data-src') ||
        img.getAttribute('data-actualsrc') ||
        img.getAttribute('data-large') ||
        ''
      if (!src || src.startsWith('data:')) continue
      // 确保是相册CDN图片
      if (!QQ_ALBUM_CDN_RE.test(src)) continue

      const enlarged = enlargeQqImageUrl(src)
      const abs = toAbsoluteUrl(enlarged, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.88,
        site: 'qq-album'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromAlbumCover(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // 相册封面图
  const coverSelectors = ['.album-cover img', '.cover-img img', '.album-info img']
  for (const sel of coverSelectors) {
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(sel))) {
      const src =
        img.src ||
        img.getAttribute('data-src') ||
        ''
      if (!src) continue
      const enlarged = enlargeQqImageUrl(src)
      const abs = toAbsoluteUrl(enlarged, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.84,
        site: 'qq-album'
      })
      if (cand) out.push(cand)
    }
  }

  // og:image 也可能是封面
  for (const sel of ['meta[property="og:image"]', 'meta[name="og:image"]']) {
    const content = document.querySelector(sel)?.getAttribute('content') || ''
    if (!content) continue
    const enlarged = enlargeQqImageUrl(content)
    const abs = toAbsoluteUrl(enlarged, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.85,
      site: 'qq-album'
    })
    if (cand) out.push(cand)
  }

  return out
}

function fromCdnImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // 扫描页面中所有来自QQ相册CDN的大图
  for (const img of Array.from(document.querySelectorAll<HTMLImageElement>('img'))) {
    const src = img.src || img.getAttribute('data-src') || ''
    if (!QQ_ALBUM_CDN_RE.test(src)) continue
    if (img.classList.contains('avatar') || src.includes('headicon')) continue

    const enlarged = enlargeQqImageUrl(src)
    const abs = toAbsoluteUrl(enlarged, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.86,
      site: 'qq-album'
    })
    if (cand) out.push(cand)
  }
  return out
}

export function resolveQqAlbumCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  try {
    if (!HOST_RE.test(location.hostname)) return []
  } catch {
    return []
  }

  return dedupeCandidates([
    ...fromAlbumCover(pageUrl, pageTitle),
    ...fromPhotoListElements(pageUrl, pageTitle),
    ...fromCdnImages(pageUrl, pageTitle),
  ])
}
