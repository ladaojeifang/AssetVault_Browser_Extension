import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

function fromMetaTags(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []

  // og:image — 主预览图
  const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content')
  if (ogImage) {
    const abs = toAbsoluteUrl(ogImage, pageUrl)
    if (abs) {
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.72,
        site: 'zcool'
      })
      if (cand) out.push(cand)
    }
  }

  // og:image:secure_url
  const secureImg = document.querySelector('meta[property="og:image:secure_url"]')?.getAttribute('content')
  if (secureImg) {
    const abs = toAbsoluteUrl(secureImg, pageUrl)
    if (abs) {
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.72,
        site: 'zcool'
      })
      if (cand) out.push(cand)
    }
  }

  // twitter:image
  const twImg = document.querySelector('meta[name="twitter:image"]')?.getAttribute('content')
  if (twImg) {
    const abs = toAbsoluteUrl(twImg, pageUrl)
    if (abs) {
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.68,
        site: 'zcool'
      })
      if (cand) out.push(cand)
    }
  }

  return out
}

function fromWorkShowImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []

  // 作品展示区域的主要图片选择器
  const selectors = [
    '.work-show-box img',
    '.detail-content img',
    '.work-detail img',
    '.artwork-images img',
    '.show-content img',
    '.product-content img',
    '[class*="work-show"] img',
    '[class*="detail-image"] img',
    '[class*="artwork"] img',
    // 站酷常用的图片容器
    '.exhibition-work img',
    '.work-main img',
    '.image-box img'
  ]

  for (const sel of selectors) {
    const imgs = document.querySelectorAll<HTMLImageElement>(sel)
    for (const el of imgs) {
      const src =
        (el as HTMLImageElement).currentSrc ||
        el.getAttribute('src') ||
        el.getAttribute('data-src') ||
        el.getAttribute('data-original') ||
        ''

      if (!src || src.startsWith('data:')) continue
      // 跳过明显的小图标/logo
      if (el.width < 100 || el.height < 100) continue

      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.85,
        site: 'zcool'
      })
      if (cand) out.push(cand)
    }
  }

  return out
}

function fromScriptData(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []

  // 站酷在页面中嵌入了作品数据 JSON
  // 常见模式：__INITIAL_STATE__, window.__data__, 或内联 JSON
  for (const s of Array.from(document.querySelectorAll<HTMLImageElement>('script'))) {
    const txt = s.textContent || ''
    if (!txt) continue

    // 匹配站酷 CDN 图片 URL（zcool.cn 域名下或其图片 CDN）
    const patterns = [
      // zcool CDN 图片
      /https?:\/\/(?:img|cdn|static|pic)[^\s"'\\]*\.zcool\.cn[^\s"'\\]*\.(?:jpg|jpeg|png|gif|webp)(?:\?[^\s"'\\]*)?/gi,
      // zcool 文件服务
      /https?:\/\/(?:file|dl|download)[^\s"'\\]*\.zcool\.cn[^\s"'\\]*/gi,
      // 通用图片 URL（站酷可能使用外部 CDN）
      /https?:\/\/[^\s"'\\]*\.(?:jpg|jpeg|png|gif|webp)(?:\?[^\s"'\\]*)?/gi
    ]

    for (const re of patterns) {
      const hits = txt.match(re) || []
      for (const hit of hits) {
        // 过滤掉太短的或明显的非内容图片
        if (hit.includes('icon') || hit.includes('logo') || hit.includes('avatar')) continue
        if (hit.length < 30) continue
        const abs = toAbsoluteUrl(hit, pageUrl)
        if (!abs) continue
        const cand = makeMediaCandidate({
          url: abs,
          pageUrl,
          pageTitle,
          referer: pageUrl,
          confidence: 0.8,
          site: 'zcool'
        })
        if (cand) out.push(cand)
      }
    }

    // 尝试解析 __INITIAL_STATE__ 或类似数据
    const stateMatches = txt.match(/(?:__INITIAL_STATE__|__NEXT_DATA__|window\.__data__)\s*=\s*(\{[\s\S]*?\})(?:\s*<\/script|\s*$)/)
    if (stateMatches?.[1]) {
      try {
        const json = JSON.parse(stateMatches[1])
        extractImagesFromObject(json, pageUrl, pageTitle, out)
      } catch {
        // 忽略解析错误
      }
    }
  }

  return out
}

/**
 * 递归从 JSON 对象中提取图片 URL
 */
function extractImagesFromObject(obj: unknown, pageUrl: string, pageTitle: string, out: MediaCandidate[]) {
  if (!obj || typeof obj !== 'object') return

  if (typeof obj === 'string' && /\.(jpg|jpeg|png|gif|webp)(\?|#|$)/i.test(obj)) {
    const abs = toAbsoluteUrl(obj, pageUrl)
    if (abs) {
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.83,
        site: 'zcool'
      })
      if (cand) out.push(cand)
    }
    return
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      extractImagesFromObject(item, pageUrl, pageTitle, out)
    }
    return
  }

  // 遍历对象属性
  for (const value of Object.values(obj as Record<string, unknown>)) {
    if (typeof value === 'object' && value !== null) {
      extractImagesFromObject(value, pageUrl, pageTitle, out)
    } else if (typeof value === 'string' && /\.(jpg|jpeg|png|gif|webp)(\?|#|$)/i.test(value)) {
      const abs = toAbsoluteUrl(value, pageUrl)
      if (abs) {
        const cand = makeMediaCandidate({
          url: abs,
          pageUrl,
          pageTitle,
          referer: pageUrl,
          confidence: 0.81,
          site: 'zcool'
        })
        if (cand) out.push(cand)
      }
    }
  }
}

function fromBackgroundImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // 站酷有时用背景图展示作品大图
  const bgSelectors = [
    '.work-show-box',
    '.detail-content',
    '.show-content',
    '.artwork-show',
    '[class*="work-show"]',
    '[class*="detail-content"]'
  ]

  for (const sel of bgSelectors) {
    const els = document.querySelectorAll(sel)
    for (const el of els) {
      const bg = getComputedStyle(el as Element).backgroundImage
      const match = bg.match(/url\(["']?(.*?)["']?\)/)
      if (match?.[1]) {
        const abs = toAbsoluteUrl(match[1], pageUrl)
        if (!abs) continue
        const cand = makeMediaCandidate({
          url: abs,
          pageUrl,
          pageTitle,
          referer: pageUrl,
          confidence: 0.78,
          site: 'zcool'
        })
        if (cand) out.push(cand)
      }
    }
  }

  // 也检查行内 style 中的 background-image
  const inlineBgEls = document.querySelectorAll('[style*="background-image"]')
  for (const el of inlineBgEls) {
    const style = el.getAttribute('style') || ''
    const match = style.match(/background-image\s*:\s*url\(["']?(.*?)["']?\)/i)
    if (match?.[1]) {
      const abs = toAbsoluteUrl(match[1], pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.77,
        site: 'zcool'
      })
      if (cand) out.push(cand)
    }
  }

  return out
}

export function resolveZcoolCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  if (!/zcool\.com(\.cn)?$/i.test(location.hostname)) return []
  return dedupeCandidates([
    ...fromMetaTags(pageUrl, pageTitle),
    ...fromWorkShowImages(pageUrl, pageTitle),
    ...fromScriptData(pageUrl, pageTitle),
    ...fromBackgroundImages(pageUrl, pageTitle)
  ])
}
