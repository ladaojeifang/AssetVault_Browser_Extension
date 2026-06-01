import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const HOST_RE = /douban\.com.*photo|photo\.douban\.com/i

/** 豆瓣相册CDN域名 */
const DOUBAN_CDN_RE = /img\d*\.doubanio\.com/i

/**
 * 豆瓣图片URL高清化：
 * 豆瓣图片URL格式如 https://imgX.doubanio.com/view/photo/l/public/pXXXXX.jpg
 * 其中 l/m/s/th 表示不同尺寸，尝试替换为更大尺寸
 */
function enlargeDoubanUrl(raw: string): string {
  let url = raw
  // 豆瓣图片路径中可能包含 size 标识: /l/public/, /m/public/, /s/public/, /th/public/
  const sizeMap: Record<string, string> = {
    s: 'l',
    th: 'l',
    m: 'l',
    b: 'l',
  }
  for (const [small, large] of Object.entries(sizeMap)) {
    const pattern = new RegExp(`(/${small}/public/)`, 'gi')
    if (pattern.test(url)) {
      url = url.replace(pattern, `/l/public/`)
      break
    }
  }
  return url
}

function fromOgMeta(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const sel of ['meta[property="og:image"]', 'meta[name="og:image"]']) {
    const content = document.querySelector(sel)?.getAttribute('content') || ''
    if (!content) continue
    const enlarged = enlargeDoubanUrl(content)
    const abs = toAbsoluteUrl(enlarged, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.87,
      site: 'douban-album'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromAlbumPhotos(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    '.photo-wrap img',
    '.album-photo img',
    '.photo-list img',
    '.photo-item img',
    '.photo-grid img',
    '.album-photo-wrap img',
    'ul.photo-col img',
  ]

  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll(sel))) {
      const src =
        img.src ||
        img.getAttribute('data-src') ||
        img.getAttribute('data-original') ||
        img.getAttribute('data-fullsrc') ||
        ''
      if (!src || src.startsWith('data:')) continue

      const enlarged = enlargeDoubanUrl(src)
      const abs = toAbsoluteUrl(enlarged, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.88,
        site: 'douban-album'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromCdnImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // 批量收集页面中所有豆瓣CDN图片
  for (const img of Array.from(document.querySelectorAll('img'))) {
    const src = img.src || img.getAttribute('data-src') || ''
    if (!DOUBAN_CDN_RE.test(src)) continue
    // 过滤用户头像
    if (
      img.classList.contains('usr-pic') ||
      img.closest('.user-info') ||
      src.includes('/icon/')
    ) continue

    const enlarged = enlargeDoubanUrl(src)
    const abs = toAbsoluteUrl(enlarged, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.85,
      site: 'douban-album'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromScriptExtract(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // 从 script 中提取 doubanio CDN 图片
  const doubanImgRe = /https?:\/\/[^\s"'\\<>]*doubanio\.com[^\s"'\\<>]*\.(?:jpg|jpeg|png|gif|webp)(\?[^\s"'\\<>]*)?/gi

  for (const s of Array.from(document.querySelectorAll('script'))) {
    const txt = s.textContent || ''
    if (!txt.includes('doubanio')) continue
    const hits = txt.match(doubanImgRe) || []
    for (const hit of hits) {
      const enlarged = enlargeDoubanUrl(hit)
      const abs = toAbsoluteUrl(enlarged, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.76,
        site: 'douban-album'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

export function resolveDoubanAlbumCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  try {
    if (!HOST_RE.test(location.hostname)) return []
  } catch {
    return []
  }

  return dedupeCandidates([
    ...fromOgMeta(pageUrl, pageTitle),
    ...fromAlbumPhotos(pageUrl, pageTitle),
    ...fromCdnImages(pageUrl, pageTitle),
    ...fromScriptExtract(pageUrl, pageTitle),
  ])
}
