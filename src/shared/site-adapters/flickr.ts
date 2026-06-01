import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

/**
 * Flickr 图片尺寸后缀（从小到大）
 * _m=小, _n=中, _z=中大, _c=大, _b=大, _h=大, _k=超大, _o=原始
 */
const SIZE_SUFFIXES = ['_m', '_n', '_z', '_c', '_b', '_h', '_k', '_o']

/**
 * 将 Flickr URL 升级为原图 URL
 */
function toOriginalSize(url: string): string | null {
  let processed = url
  // 替换已知尺寸后缀为 _o（原图）
  for (const suffix of SIZE_SUFFIXES.slice(0, -1)) {
    // 匹配 _suffix. 扩展名之前的位置
    processed = processed.replace(new RegExp(`${suffix}\\.(jpg|jpeg|png|gif)$`, 'i'), `_o.$1`)
  }
  return processed
}

function fromMetaTags(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []

  // og:image
  const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content')
  if (ogImage) {
    // 尝试获取原图
    const origUrl = toOriginalSize(ogImage)
    const abs = toAbsoluteUrl(origUrl || ogImage, pageUrl)
    if (abs) {
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: origUrl ? 0.85 : 0.75,
        site: 'flickr'
      })
      if (cand) out.push(cand)
    }
  }

  // twitter:image 等其他 meta
  for (const prop of ['twitter:image', 'og:image:secure_url']) {
    const content = document.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`)?.getAttribute('content')
    if (!content) continue
    const origUrl = toOriginalSize(content)
    const abs = toAbsoluteUrl(origUrl || content, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: origUrl ? 0.82 : 0.7,
      site: 'flickr'
    })
    if (cand) out.push(cand)
  }

  // og:video（如果有的话，某些 Flickr 内容可能是视频）
  const ogVideo = document.querySelector('meta[property="og:video"]')?.getAttribute('content')
  if (ogVideo) {
    const abs = toAbsoluteUrl(ogVideo, pageUrl)
    if (abs) {
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.75,
        site: 'flickr'
      })
      if (cand) out.push(cand)
    }
  }

  return out
}

function fromPageImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []

  // 主图片元素
  const mainImgSelectors = [
    '.main-photo img',
    '.photo-img img',
    '#main-photo-container img',
    '.zoomable img',
    'img[data-testid="photo-image"]',
    'img.main-photo',
    '#photo img'
  ]

  for (const sel of mainImgSelectors) {
    const el = document.querySelector(sel)
    if (!el) continue

    // 尝试多个属性获取 src
    const src =
      (el as HTMLImageElement).currentSrc ||
      el.getAttribute('src') ||
      el.getAttribute('data-src') ||
      el.getAttribute('data-lazy-src')

    if (!src) continue
    const origUrl = toOriginalSize(src)
    const abs = toAbsoluteUrl(origUrl || src, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: origUrl ? 0.92 : 0.82,
      site: 'flickr'
    })
    if (cand) out.push(cand)
  }

  // 所有 staticflickr.com 的图片
  const allImgs = document.querySelectorAll('img[src*="staticflickr.com"], img[src*="live.staticflickr.com"]')
  for (const img of allImgs) {
    const src =
      (img as HTMLImageElement).currentSrc ||
      img.getAttribute('src') ||
      ''

    // 跳过太小的图标/头像
    if (src.includes('_s.') || src.includes('_sq.')) continue

    const origUrl = toOriginalSize(src)
    const abs = toAbsoluteUrl(origUrl || src, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: origUrl ? 0.88 : 0.72,
      site: 'flickr'
    })
    if (cand) out.push(cand)
  }

  return out
}

function fromScriptData(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // Flickr 在 script 标签中嵌入模型数据
  for (const s of Array.from(document.querySelectorAll('script'))) {
    const txt = s.textContent || ''
    if (!txt.includes('staticflickr') && !txt.includes('live.staticflickr')) continue

    // 匹配所有 staticflickr URL
    const re = /https?:\/\/(?:live\.)?staticflickr\.com\/[^\s"'\\<>]+?\.(?:jpg|jpeg|png|gif)/gi
    const hits = txt.match(re) || []
    for (const hit of hits) {
      if (hit.includes('_s.') || hit.includes('_sq.')) continue // 跳过缩略图
      const origUrl = toOriginalSize(hit)
      const abs = toAbsoluteUrl(origUrl || hit, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: origUrl ? 0.86 : 0.74,
        site: 'flickr'
      })
      if (cand) out.push(cand)
    }
  }

  // 从 page export data 中提取
  const modelData = document.querySelector('script[type="application/ld+json"]')
  if (modelData) {
    try {
      const json = JSON.parse(modelData.textContent || '')
      const imageUrl = json.image || json.contentUrl || json.thumbnailUrl
      if (imageUrl) {
        const origUrl = typeof imageUrl === 'string' ? toOriginalSize(imageUrl) : null
        const target = origUrl || (typeof imageUrl === 'string' ? imageUrl : '')
        const abs = toAbsoluteUrl(target, pageUrl)
        if (abs) {
          const cand = makeMediaCandidate({
            url: abs,
            pageUrl,
            pageTitle,
            referer: pageUrl,
            confidence: origUrl ? 0.84 : 0.73,
            site: 'flickr'
          })
          if (cand) out.push(cand)
        }
      }
    } catch {
      // ignore
    }
  }

  return out
}

export function resolveFlickrCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  if (!/flickr\.com/i.test(location.hostname)) return []
  return dedupeCandidates([
    ...fromMetaTags(pageUrl, pageTitle),
    ...fromPageImages(pageUrl, pageTitle),
    ...fromScriptData(pageUrl, pageTitle)
  ])
}
