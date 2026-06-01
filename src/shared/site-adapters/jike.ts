import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const HOST_RE = /ok\.(jike|ruguoapp)\.com|web\.okjike\.com/i

function fromOgMeta(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const sel of ['meta[property="og:image"]', 'meta[name="og:image"]']) {
    const content = document.querySelector(sel)?.getAttribute('content') || ''
    if (!content) continue
    const abs = toAbsoluteUrl(content, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.86,
      site: 'jike'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromPostContentImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    '.post-content img',
    '.image-block img',
    '.card-image img',
    '.post-card img',
    '.topic-detail img',
    '.feed-item img[src*="pic1"]',
    '.feed-item img[src*="jpg"]',
    '.feed-item img[src*="png"]',
    '.feed-item img[src*="webp"]',
  ]

  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(sel))) {
      const src =
        img.src ||
        img.getAttribute('data-src') ||
        img.getAttribute('data-original') ||
        img.getAttribute('data-url') ||
        ''
      if (!src || src.startsWith('data:')) continue
      // 跳过头像、表情等小尺寸非内容图
      if (img.classList.contains('avatar') || src.includes('/avatar/')) continue
      if (img.width > 0 && img.width < 40 && img.height < 40) continue

      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const w = img.naturalWidth || img.width || 0
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: w >= 200 ? 0.87 : 0.84,
        site: 'jike'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromDynamicImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // 即刻动态内容中的图片，可能通过 background-image 或 data 属性加载
  for (const el of Array.from(
    document.querySelectorAll('[style*="background-image"], [data-src], [data-image]')
  )) {
    let src = ''
    const style = el.getAttribute('style') || ''
    const bgMatch = style.match(/background-image:\s*url\(['"]?([^'")]+)['"]?\)/)
    if (bgMatch) {
      src = bgMatch[1]
    } else {
      src = (el as HTMLElement).dataset.src || (el as HTMLElement).dataset.image || ''
    }
    if (!src || src.startsWith('data:')) continue

    const abs = toAbsoluteUrl(src, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.85,
      site: 'jike'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromScriptExtract(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // 从 script 中提取即刻 CDN 图片 URL（通常为 pic1.zhimg.com 或类似）
  const jikeImgRe = /https?:\/\/[^\s"'\\<>]*(?:pic\d+\.zhimg\.com|jike\.(?:com|cn)|ruguoapp)[^\s"'\\<>]*/gi

  for (const s of Array.from(document.querySelectorAll<HTMLImageElement>('script'))) {
    const txt = s.textContent || ''
    if (!txt.includes('image') && !txt.includes('pic')) continue
    const hits = txt.match(jikeImgRe) || []
    for (const hit of hits) {
      const abs = toAbsoluteUrl(hit, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.78,
        site: 'jike'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

export function resolveJikeCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  try {
    if (!HOST_RE.test(location.hostname)) return []
  } catch {
    return []
  }

  return dedupeCandidates([
    ...fromOgMeta(pageUrl, pageTitle),
    ...fromPostContentImages(pageUrl, pageTitle),
    ...fromDynamicImages(pageUrl, pageTitle),
    ...fromScriptExtract(pageUrl, pageTitle),
  ])
}
