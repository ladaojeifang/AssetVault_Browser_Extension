import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const HOST_RE = /giphy\.com/i

/** GIPHY CDN 域名 */
const GIPHY_CDN_RE = /media\.giphy\.com|i\.giphy\.com|media\d*\.giphy\.com/i

function fromGifPlayerImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // GIF播放器中的图片元素
  const gifSelectors = [
    '.gif-player img',
    '.giphy-gif img',
    '.Gif-player img',
    '.gif img',
    '.GiphyGif img',
    '.gif-container img',
    '[data-giphy-id] img',
    '.GifGridItem img',
    '.gif-link img',
  ]

  for (const sel of gifSelectors) {
    for (const img of Array.from(document.querySelectorAll(sel))) {
      const src =
        img.src ||
        img.getAttribute('data-src') ||
        img.getAttribute('data-original') ||
        img.getAttribute('data-gif') ||
        img.getAttribute('data-animate') ||
        ''
      if (!src || src.startsWith('data:')) continue

      // 判断是否为GIF动图（优先）
      const isGif = /\.gif(v)?(\?|#|$)/i.test(src) ||
                    img.getAttribute('data-type') === 'gif' ||
                    !!img.closest('.gif-player')

      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: isGif ? 0.90 : 0.80,
        site: 'giphy'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromVideoSources(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // GIPHY 使用 video 标签来播放 GIF 动画
  for (const v of Array.from(document.querySelectorAll('video'))) {
    // source 元素
    for (const sourceEl of Array.from(v.querySelectorAll('source'))) {
      const src = sourceEl.getAttribute('src') || ''
      if (!src) continue
      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        duration: Number.isFinite(v.duration) ? v.duration : undefined,
        confidence: 0.87,
        site: 'giphy'
      })
      if (cand) out.push(cand)
    }
    // video 直接的 currentSrc / src
    for (const vSrc of [v.currentSrc, v.src]) {
      if (!vSrc) continue
      const abs = toAbsoluteUrl(vSrc, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        duration: Number.isFinite(v.duration) ? v.duration : undefined,
        confidence: 0.87,
        site: 'giphy'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromOgMeta(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // og:image 和 og:video meta tags
  const metaProps = [
    'og:image',
    'og:image:url',
    'og:video',
    'og:video:url',
    'og:video:secure_url',
    'twitter:image',
    'twitter:player:stream',
  ]
  for (const prop of metaProps) {
    const content =
      document.querySelector(`meta[property="${prop}"]`)?.getAttribute('content') ||
      document.querySelector(`meta[name="${prop}"]`)?.getAttribute('content') ||
      ''
    if (!content) continue
    const abs = toAbsoluteUrl(content, pageUrl)
    if (!abs) continue
    const isVideo = prop.includes('video')
    const isGif = /\.gif(\?|#|$)/i.test(abs) || prop === 'twitter:image'
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: isGif ? 0.90 : isVideo ? 0.87 : 0.82,
      site: 'giphy'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromCdnImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // 扫描页面所有 GIPHY CDN 图片/媒体
  for (const img of Array.from(document.querySelectorAll('img'))) {
    const src = img.src || img.getAttribute('data-src') || ''
    if (!GIPHY_CDN_RE.test(src)) continue

    const isGif = /\.gif(v)?(\?|#|$)/i.test(src)
    const abs = toAbsoluteUrl(src, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: isGif ? 0.90 : 0.80,
      site: 'giphy'
    })
    if (cand) out.push(cand)
  }
  return out
}

export function resolveGiphyCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  try {
    if (!HOST_RE.test(location.hostname)) return []
  } catch {
    return []
  }

  return dedupeCandidates([
    ...fromOgMeta(pageUrl, pageTitle),
    ...fromGifPlayerImages(pageUrl, pageTitle),
    ...fromVideoSources(pageUrl, pageTitle),
    ...fromCdnImages(pageUrl, pageTitle),
  ])
}
