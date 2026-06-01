import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const HOST_RE = /tieba\.baidu\.com/i

/** 百度贴吧内容图片CDN域名 */
const TIEBA_CONTENT_IMG_RE = /imgsrc\.baidu\.com|hiphotos\.baidu\.com|img\.baidu\.com\/forum/i

/** 需要过滤的图片模式（头像、表情包、装饰） */
const FILTER_RE = /avatar|face|smile|emoticon|emoji|static\.tieba\.baidu\.com.*\/tb\/icon|tb\.baidu\.com\/tb\/icon/i

function isContentImage(img: HTMLImageElement, src: string): boolean {
  // 过滤头像
  if (img.classList.contains('card_head_face_img')) return false
  if (FILTER_RE.test(src)) return false
  // 过滤表情包（通常在特定容器内）
  const parent = img.closest('.BDE_Smiley, .BDE_Face')
  if (parent) return false
  // 过滤小图标
  if (img.naturalWidth > 0 && img.naturalWidth < 30 && img.naturalHeight < 30) return false
  return true
}

function enlargeTiebaUrl(raw: string): string {
  let url = raw
  // 贴吧图片URL可能有缩略图参数，如 &tp=webp&wx=48&wy=48
  url = url.replace(/[&?](?:tp|wx|wy)=\d+/gi, '&')
  url = url.replace(/[&?]{2,}/g, '&').replace(/[&?]$/, '')
  // 缩略图中可能包含 _thumb 后缀
  url = url.replace(/_thumb(?=\.\w+$)/i, '')
  return url
}

function fromPostContentImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // 帖子正文内容区的图片选择器
  const contentSelectors = [
    '.BDE_Image img',
    '.d_post_content img',
    '.j_d_post_content img',
    '.pdb_content img',
    '.post_bmw_middle img',
    '#post_content_list img',
  ]

  for (const sel of contentSelectors) {
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(sel))) {
      const src =
        img.src ||
        img.getAttribute('data-src') ||
        img.getAttribute('data-original') ||
        ''
      if (!src || src.startsWith('data:')) continue

      // 只处理内容相关图片
      if (!isContentImage(img, src)) continue

      const enlarged = enlargeTiebaUrl(src)
      const abs = toAbsoluteUrl(enlarged, pageUrl)
      if (!abs) continue

      const w = img.naturalWidth || img.width || 0
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: w >= 150 ? 0.87 : 0.82,
        site: 'tieba'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromNestedQuoteImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // 楼中楼引用区域的图片
  const nestedSelectors = [
    '.d_post_content_jj img.BDE_Image',
    '.nested-post img.BDE_Image',
    '.quote_content img',
  ]
  for (const sel of nestedSelectors) {
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(sel))) {
      const src = img.src || img.getAttribute('data-src') || ''
      if (!src) continue
      if (!isContentImage(img, src)) continue

      const enlarged = enlargeTiebaUrl(src)
      const abs = toAbsoluteUrl(enlarged, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.83,
        site: 'tieba'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromCdnImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // 扫描页面中所有贴吧内容CDN图片
  for (const img of Array.from(document.querySelectorAll<HTMLImageElement>('img'))) {
    const src = img.src || img.getAttribute('data-src') || ''
    if (!TIEBA_CONTENT_IMG_RE.test(src)) continue
    if (!isContentImage(img, src)) continue

    const enlarged = enlargeTiebaUrl(src)
    const abs = toAbsoluteUrl(enlarged, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.84,
      site: 'tieba'
    })
    if (cand) out.push(cand)
  }
  return out
}

export function resolveTiebaCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  try {
    if (!HOST_RE.test(location.hostname)) return []
  } catch {
    return []
  }

  return dedupeCandidates([
    ...fromPostContentImages(pageUrl, pageTitle),
    ...fromNestedQuoteImages(pageUrl, pageTitle),
    ...fromCdnImages(pageUrl, pageTitle),
  ])
}
