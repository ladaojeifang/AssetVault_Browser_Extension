import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const HOST_RE = /poco\.cn|pocophoto\.cn/i

/** POCO摄影 CDN 域名 */
const POCO_CDN_RE = /(?:img|photo|static)\.?pocophoto\.cn|img\d*\.poco\.cn|photo\d*\.poco\.cn/i

/**
 * POCO图片URL高清化：
 * POCO的图片URL常包含尺寸参数，如 _480.jpg 或 ?w=480
 * 尝试获取更大版本
 */
function enlargePocoUrl(raw: string): string {
  let url = raw
  // 替换常见的小尺寸后缀
  const suffixes = ['_120', '_240', '_320', '_480', '_640']
  for (const suf of suffixes) {
    const idx = url.lastIndexOf(suf + '.')
    if (idx > 0 && idx > url.lastIndexOf('/') && !url.includes(suf + '_' + suf)) {
      url = url.substring(0, idx) + url.substring(idx + suf.length)
      break
    }
  }
  // 处理查询参数中的宽高限制
  url = url.replace(/[&?]w=\d+/i, '')
  url = url.replace(/[&?]h=\d+/i, '')
  return url
}

function fromOgMeta(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const prop of ['og:image', 'og:image:url']) {
    const content =
      document.querySelector(`meta[property="${prop}"]`)?.getAttribute('content') ||
      document.querySelector(`meta[name="${prop}"]`)?.getAttribute('content') ||
      ''
    if (!content) continue
    const enlarged = enlargePocoUrl(content)
    const abs = toAbsoluteUrl(enlarged, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.87,
      site: 'poco'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromWorkDetailImage(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // 作品详情页的主图元素
  const mainImgSelectors = [
    '.work-detail img.main-photo',
    '.detail-main img',
    '.photo-viewer img',
    '.works-show img',
    '.detail-img img',
    '.photo-box img',
    '#mainImage img',
    '.big-pic img',
  ]

  for (const sel of mainImgSelectors) {
    for (const img of Array.from(document.querySelectorAll(sel))) {
      const src =
        img.src ||
        img.getAttribute('data-src') ||
        img.getAttribute('data-original') ||
        img.getAttribute('data-hd') ||
        ''
      if (!src || src.startsWith('data:')) continue

      const enlarged = enlargePocoUrl(src)
      const abs = toAbsoluteUrl(enlarged, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.89,
        site: 'poco'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromCdnImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // 扫描页面中所有POCO CDN图片
  for (const img of Array.from(document.querySelectorAll('img'))) {
    const src = img.src || img.getAttribute('data-src') || ''
    if (!POCO_CDN_RE.test(src)) continue
    // 跳过头像、logo、UI装饰
    if (
      img.classList.contains('avatar') ||
      img.classList.contains('logo') ||
      src.includes('/avatar/') ||
      src.includes('/logo/') ||
      src.includes('icon')
    ) continue
    if (img.naturalWidth > 0 && img.naturalWidth < 50 && img.naturalHeight < 50) continue

    const enlarged = enlargePocoUrl(src)
    const abs = toAbsoluteUrl(enlarged, pageUrl)
    if (!abs) continue
    const w = img.naturalWidth || img.width || 0
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: w >= 400 ? 0.88 : 0.84,
      site: 'poco'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromScriptExtract(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // 从 script 中提取 POCO CDN 图片
  const pocoImgRe = /https?:\/\/[^\s"'\\<>]*(?:pocophoto\.cn|poco\.cn)[^\s"'\\<>]*\.(?:jpg|jpeg|png|gif|webp)(\?[^\s"'\\<>]*)?/gi

  for (const s of Array.from(document.querySelectorAll('script'))) {
    const txt = s.textContent || ''
    if (!txt.includes('pocophoto') && !txt.includes('poco.cn')) continue
    const hits = txt.match(pocoImgRe) || []
    for (const hit of hits) {
      const enlarged = enlargePocoUrl(hit)
      const abs = toAbsoluteUrl(enlarged, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.78,
        site: 'poco'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

export function resolvePocoCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  try {
    if (!HOST_RE.test(location.hostname)) return []
  } catch {
    return []
  }

  return dedupeCandidates([
    ...fromOgMeta(pageUrl, pageTitle),
    ...fromWorkDetailImage(pageUrl, pageTitle),
    ...fromCdnImages(pageUrl, pageTitle),
    ...fromScriptExtract(pageUrl, pageTitle),
  ])
}
