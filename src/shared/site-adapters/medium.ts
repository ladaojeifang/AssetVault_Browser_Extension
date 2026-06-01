import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const HOST_RE = /medium\.com/i

/** Medium 内容图片CDN域名 */
const MEDIUM_CDN_RE = /miro\.medium\.com|cdn-images-\d+\.medium\.com|medium\.com\/_next\/static\/image/i

/** 需要跳过的非内容元素类名/属性 */
const SKIP_CLASS_RE = /avatar|icon|logo|ui_|gravatar|user-image/i

/**
 * Medium 图片URL高清化：
 * Medium的图片URL通常包含宽度参数，如 ?w=640
 * 尝试增大或移除宽度限制以获取更高分辨率
 */
function optimizeMediumUrl(raw: string): string {
  let url = raw
  // Medium 图片URL常有 width 参数: ?w=640 或 ?w=1080
  const wMatch = url.match(/[?&]w=(\d+)/)
  if (wMatch) {
    const currentW = parseInt(wMatch[1], 10)
    if (currentW < 2048) {
      url = url.replace(wMatch[0], `w=3840`)
    }
  }
  return url
}

function fromOgMeta(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // Medium 的 og:image 通常是高质量封面图
  for (const prop of ['og:image', 'og:image:url']) {
    const content =
      document.querySelector(`meta[property="${prop}"]`)?.getAttribute('content') ||
      document.querySelector(`meta[name="${prop}"]`)?.getAttribute('content') ||
      ''
    if (!content) continue
    const optimized = optimizeMediumUrl(content)
    const abs = toAbsoluteUrl(optimized, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.90,
      site: 'medium'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromArticleBodyImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // 文章正文中的图片选择器
  const articleSelectors = [
    'article img',
    '.postBody img',
    'figure img',
    '.graf-image',
    '.section-inner-layout img',
    '.postField-content img',
    '[data-testid="storyContent"] img',
    '.article-body img',
    '.post-article img',
  ]

  for (const sel of articleSelectors) {
    for (const img of Array.from(document.querySelectorAll(sel))) {
      const src =
        img.src ||
        img.getAttribute('data-src') ||
        img.getAttribute('data-image-src') ||
        ''
      if (!src || src.startsWith('data:')) continue

      // 过滤 avatar、icon 等非内容图片
      if (SKIP_CLASS_RE.test(img.className)) continue
      // 检查是否在作者信息区域
      if (img.closest('.postMetaInline-authorImage') || img.closest('.author-avatar')) continue
      // 过滤小尺寸UI图标
      if (img.naturalWidth > 0 && img.naturalWidth < 50 && img.naturalHeight < 50) continue

      const optimized = optimizeMediumUrl(src)
      const abs = toAbsoluteUrl(optimized, pageUrl)
      if (!abs) continue
      const w = img.naturalWidth || img.width || 0
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: w >= 300 ? 0.87 : 0.83,
        site: 'medium'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromCdnImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // 扫描页面所有 Medium CDN 图片
  for (const img of Array.from(document.querySelectorAll('img'))) {
    const src = img.src || img.getAttribute('data-src') || ''
    if (!MEDIUM_CDN_RE.test(src)) continue

    // 过滤非内容图
    if (SKIP_CLASS_RE.test(img.className)) continue
    if (img.closest('nav') || img.closest('header') || img.closest('footer')) continue
    if (img.naturalWidth > 0 && img.naturalWidth < 60 && img.naturalHeight < 60) continue

    const optimized = optimizeMediumUrl(src)
    const abs = toAbsoluteUrl(optimized, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.84,
      site: 'medium'
    })
    if (cand) out.push(cand)
  }
  return out
}

export function resolveMediumCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  try {
    if (!HOST_RE.test(location.hostname)) return []
  } catch {
    return []
  }

  return dedupeCandidates([
    ...fromOgMeta(pageUrl, pageTitle),
    ...fromArticleBodyImages(pageUrl, pageTitle),
    ...fromCdnImages(pageUrl, pageTitle),
  ])
}
