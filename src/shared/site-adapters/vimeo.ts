import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

/**
 * Vimeo 配置结构（从页面 script 提取）
 */
type VimeoConfig = {
  video?: {
    id?: string
    title?: string
    owner?: { name?: string }
    duration?: number
    thumbnail?: string
  }
  request?: {
    files?: {
      progressive?: Array<{ url?: string; quality: string; width?: number; height?: number }>
      hls?: { cdns?: Record<string, { url?: string }> }
    }
  }
}

function parseVimeoConfig(): VimeoConfig | null {
  for (const s of Array.from(document.querySelectorAll('script'))) {
    const txt = s.textContent || ''
    if (!txt.includes('config') || !txt.includes('progressive')) continue
    try {
      // Vimeo 常将 config 挂在 window 上或作为内联 JSON
      const match = txt.match(/(?:window\.)?(?:playerConfig|config)\s*=\s*(\{[\s\S]*?\});?\s*(?:<\/script|$)/)
      if (match?.[1]) {
        return JSON.parse(match[1])
      }
      // 备选：尝试找完整的 JSON 对象包含 files.progressive
      const jsonMatch = txt.match(/"files"\s*:\s*\{[^}]*"progressive"\s*:\s*\[([\s\S]*?)\]/)
      if (jsonMatch) {
        return JSON.parse(`{"request": {"files": {"progressive": [${jsonMatch[1]}]}}}`)
      }
    } catch {
      continue
    }
  }
  return null
}

function fromMetaTags(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []

  // og:image — 封面图
  const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content')
  if (ogImage) {
    const abs = toAbsoluteUrl(ogImage, pageUrl)
    if (abs) {
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.75,
        site: 'vimeo',
        filename: 'vimeo_cover.jpg'
      })
      if (cand) out.push(cand)
    }
  }

  // og:video / og:video:url — 视频直链
  for (const sel of ['meta[property="og:video"]', 'meta[property="og:video:url"]', 'meta[name="twitter:player:stream"]']) {
    const content = document.querySelector(sel)?.getAttribute('content')
    if (!content) continue
    const abs = toAbsoluteUrl(content, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.8,
      site: 'vimeo'
    })
    if (cand) out.push(cand)
  }

  return out
}

function fromScriptConfig(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const cfg = parseVimeoConfig()
  if (!cfg?.request?.files) return out

  const { progressive, hls } = cfg.request.files

  // progressive mp4 — 取最高质量（通常按质量排序，取最后一个或最大的）
  if (Array.isArray(progressive)) {
    let best = progressive[0]
    for (const p of progressive) {
      if (!best || ((p.width ?? 0) > (best.width ?? 0))) {
        best = p
      }
    }
    if (best?.url) {
      const abs = toAbsoluteUrl(best.url, pageUrl)
      if (abs) {
        const cand = makeMediaCandidate({
          url: abs,
          pageUrl,
          pageTitle,
          referer: pageUrl,
          confidence: 0.9,
          site: 'vimeo'
        })
        if (cand) out.push(cand)
      }
    }
    // 同时收集所有 progressive 作为备选
    for (const p of progressive) {
      if (p === best || !p.url) continue
      const abs = toAbsoluteUrl(p.url, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.72,
        site: 'vimeo'
      })
      if (cand) out.push(cand)
    }
  }

  // HLS manifest
  if (hls?.cdns) {
    for (const cdn of Object.values(hls.cdns)) {
      if (!cdn.url) continue
      const abs = toAbsoluteUrl(cdn.url, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.78,
        site: 'vimeo'
      })
      if (cand) out.push(cand)
    }
  }

  // 封面 thumbnail
  if (cfg.video?.thumbnail) {
    const abs = toAbsoluteUrl(cfg.video.thumbnail, pageUrl)
    if (abs) {
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.76,
        site: 'vimeo',
        filename: 'vimeo_thumbnail.jpg'
      })
      if (cand) out.push(cand)
    }
  }

  return out
}

function fromVideoElements(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const v of Array.from(document.querySelectorAll('video'))) {
    for (const src of [v.currentSrc, v.src]) {
      if (!src) continue
      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        duration: Number.isFinite(v.duration) ? v.duration : undefined,
        confidence: 0.75,
        site: 'vimeo'
      })
      if (cand) out.push(cand)
    }
  }
  // iframe embed 中的视频源
  for (const iframe of Array.from(document.querySelectorAll('iframe[src*="vimeo.com"]'))) {
    const src = iframe.getAttribute('src')
    if (src) {
      const abs = toAbsoluteUrl(src, pageUrl)
      if (abs && abs !== pageUrl) {
        const cand = makeMediaCandidate({
          url: abs,
          pageUrl,
          pageTitle,
          referer: pageUrl,
          confidence: 0.5,
          site: 'vimeo'
        })
        if (cand) out.push(cand)
      }
    }
  }
  return out
}

export function resolveVimeoCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  if (!/vimeo\.com/i.test(location.hostname)) return []
  return dedupeCandidates([
    ...fromMetaTags(pageUrl, pageTitle),
    ...fromScriptConfig(pageUrl, pageTitle),
    ...fromVideoElements(pageUrl, pageTitle)
  ])
}
