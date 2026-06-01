import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const HOST_RE = /\.lofter\.com/i

/** Lofter CDN 域名 */
const LOFTER_CDN_RE = /imglf\d*\.lf127\.net|img\d*\.lfcdn\.net|loftercdn\.com/i

/**
 * Lofter图片URL优化：
 * Lofter的图片URL可能带有尺寸参数，尝试去除以获得原图
 */
function optimizeLofterUrl(raw: string): string {
  let url = raw
  // 移除常见的缩略图尺寸参数
  url = url.replace(/[&?]imageView2\/[^&]*/i, '')
  url = url.replace(/[&?](?:thumbnail|quality|type)=[^&]*/gi, '')
  url = url.replace(/[&?](?:width|height)=\d+/gi, '')
  // 清理多余的 &
  while (url.endsWith('&') || url.endsWith('?')) {
    url = url.slice(0, -1)
  }
  return url
}

function fromOgMeta(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // og:image (含 tumblr card 类型)
  const metaProps = [
    'og:image',
    'og:image:url',
    'og:video',
    'og:video:url',
    'twitter:image',
    'twitter:image:src',
  ]
  for (const prop of metaProps) {
    const content =
      document.querySelector(`meta[property="${prop}"]`)?.getAttribute('content') ||
      document.querySelector(`meta[name="${prop}"]`)?.getAttribute('content') ||
      ''
    if (!content) continue
    const optimized = optimizeLofterUrl(content)
    const abs = toAbsoluteUrl(optimized, pageUrl)
    if (!abs) continue
    const isVideo = prop.includes('video')
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: isVideo ? 0.87 : 0.89,
      site: 'lofter'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromPostContentImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // Lofter 博客文章中的图片选择器
  const selectors = [
    '.post-content img',
    '.img.imgclass img',
    '.post-body img',
    '.article-body img',
    '.text img',
    '.imgbox img',
    '.photo img',
    'article img',
    '#ct_content img',
    '#blogContent img',
  ]

  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(sel))) {
      const src =
        img.src ||
        img.getAttribute('data-src') ||
        img.getAttribute('data-original') ||
        img.getAttribute('data-big') ||
        img.getAttribute('data-source') ||
        ''
      if (!src || src.startsWith('data:')) continue
      // 跳过头像
      if (
        img.closest('.header-avatar') ||
        img.closest('.userinfo') ||
        src.includes('avatar') ||
        src.includes('headicon')
      ) continue
      // 跳过极小的UI图标
      if (img.naturalWidth > 0 && img.naturalWidth < 30 && img.naturalHeight < 30) continue

      const optimized = optimizeLofterUrl(src)
      const abs = toAbsoluteUrl(optimized, pageUrl)
      if (!abs) continue
      const w = img.naturalWidth || img.width || 0
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: w >= 250 ? 0.88 : 0.85,
        site: 'lofter'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromCdnImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // 扫描页面所有 Lofter CDN 图片
  for (const img of Array.from(document.querySelectorAll<HTMLImageElement>('img'))) {
    const src = img.src || img.getAttribute('data-src') || ''
    if (!LOFTER_CDN_RE.test(src)) continue
    // 过滤头像和UI
    if (
      img.closest('.header') ||
      img.closest('.nav') ||
      src.includes('avatar') ||
      src.includes('/icons/') ||
      src.includes('/static/')
    ) continue

    const optimized = optimizeLofterUrl(src)
    const abs = toAbsoluteUrl(optimized, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.84,
      site: 'lofter'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromScriptExtract(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // 从 script 中提取 lofter CDN 图片
  const lofterImgRe = /https?:\/\/[^\s"'\\<>]*(?:lf127\.net|lfcdn\.net|loftercdn\.com)[^\s"'\\<>]*/gi

  for (const s of Array.from(document.querySelectorAll<HTMLImageElement>('script'))) {
    const txt = s.textContent || ''
    if (!txt.includes('lf127.net') && !txt.includes('lfcdn.net') && !txt.includes('loftercdn')) continue
    const hits = txt.match(lofterImgRe) || []
    for (const hit of hits) {
      if (hit.includes('avatar') || hit.includes('icon')) continue
      const optimized = optimizeLofterUrl(hit)
      const abs = toAbsoluteUrl(optimized, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.76,
        site: 'lofter'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

export function resolveLofterCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  try {
    if (!HOST_RE.test(location.hostname)) return []
  } catch {
    return []
  }

  return dedupeCandidates([
    ...fromOgMeta(pageUrl, pageTitle),
    ...fromPostContentImages(pageUrl, pageTitle),
    ...fromCdnImages(pageUrl, pageTitle),
    ...fromScriptExtract(pageUrl, pageTitle),
  ])
}
