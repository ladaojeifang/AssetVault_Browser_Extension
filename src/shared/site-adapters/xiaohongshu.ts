import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

type XhsNoteImage = {
  infoList?: Array<{ url?: string }>
  urlDefault?: string
  url?: string
}

type XhsVideoStream = {
  url?: string
  masterUrl?: string
}

type XhsDetailNote = {
  note?: {
    imageList?: XhsNoteImage[]
    video?: {
      media?: {
        stream?: XhsVideoStream
        h264List?: XhsVideoStream[]
      }
    }
    user?: { nickname?: string; userId?: string }
  }
}

type XhsInitialData = {
  note?: {
    note?: {
      imageList?: XhsNoteImage[]
      video?: {
        media?: {
          stream?: XhsVideoStream
          h264List?: XhsVideoStream[]
        }
      }
      user?: { nickname?: string; userId?: string }
    }
  }
  /** 新版结构 */
  detailMap?: Record<string, XhsDetailNote>
}

function getInitialState(): XhsInitialData | null {
  try {
    const w = window as typeof window & { __INITIAL_STATE__?: unknown }
    if (w.__INITIAL_STATE__ && typeof w.__INITIAL_STATE__ === 'object') {
      return w.__INITIAL_STATE__ as XhsInitialData
    }
  } catch { /* ignore */ }
  return null
}

function fromOgMeta(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // og:image 通常是小红书笔记封面/主图
  for (const sel of ['meta[property="og:image"]', 'meta[name="og:image"]']) {
    const el = document.querySelector(sel)
    const content = el?.getAttribute('content') || ''
    if (!content) continue
    const abs = toAbsoluteUrl(content, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.75,
      site: 'xiaohongshu'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromInitialImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const state = getInitialState()
  if (!state) return out

  let images: XhsNoteImage[] = []

  // 兼容新版 detailMap 结构
  if (state.detailMap && typeof state.detailMap === 'object') {
    const keys = Object.keys(state.detailMap)
    for (const k of keys) {
      const entry = state.detailMap[k]
      if (entry?.note?.imageList) {
        images = entry.note.imageList
        break
      }
    }
  }

  // 回退到旧结构
  if (images.length === 0 && state.note?.note?.imageList) {
    images = state.note.note.imageList
  }

  for (const img of images) {
    // 优先选最大尺寸：infoList 最后一个通常是最高清
    let bestUrl = ''
    if (img.infoList && img.infoList.length > 0) {
      const sorted = [...img.infoList].filter(i => i.url).sort((a, b) => (b.url || '').localeCompare(a.url || ''))
      bestUrl = sorted[0]?.url || ''
    }
    if (!bestUrl) bestUrl = img.urlDefault || img.url || ''
    if (!bestUrl) continue

    const abs = toAbsoluteUrl(bestUrl, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.88,
      site: 'xiaohongshu'
    })
    if (cand) out.push(cand)
  }

  return out
}

function fromInitialVideo(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const state = getInitialState()
  if (!state) return out

  let streams: XhsVideoStream[] = []

  // 兼容新版 detailMap 结构
  if (state.detailMap && typeof state.detailMap === 'object') {
    const keys = Object.keys(state.detailMap)
    for (const k of keys) {
      const entry = state.detailMap[k]
      if (entry?.note?.video?.media) {
        const m = entry.note.video.media
        if (m.stream) streams.push(m.stream)
        if (m.h264List) streams.push(...m.h264List)
        break
      }
    }
  }

  // 回退到旧结构
  if (streams.length === 0 && state.note?.note?.video?.media) {
    const m = state.note.note.video.media
    if (m.stream) streams.push(m.stream)
    if (m.h264List) streams.push(...m.h264List)
  }

  for (const s of streams) {
    const u = s.masterUrl || s.url || ''
    if (!u) continue
    const abs = toAbsoluteUrl(u, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.9,
      site: 'xiaohongshu'
    })
    if (cand) out.push(cand)
  }

  return out
}

function fromDomMedia(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const xhsCdnRe = /xhscdn\.com|ci\.xiaohongshu\.com/i

  // 扫描 CDN 图片
  for (const img of Array.from(document.querySelectorAll<HTMLImageElement>('img'))) {
    const src = img.src || img.getAttribute('data-src') || ''
    if (!xhsCdnRe.test(src)) continue
    const abs = toAbsoluteUrl(src, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.65,
      site: 'xiaohongshu'
    })
    if (cand) out.push(cand)
  }

  // 扫描视频元素
  for (const v of Array.from(document.querySelectorAll<HTMLVideoElement>('video'))) {
    for (const src of [v.currentSrc, v.src]) {
      const abs = toAbsoluteUrl(src || '', pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        duration: Number.isFinite(v.duration) ? v.duration : undefined,
        confidence: 0.72,
        site: 'xiaohongshu'
      })
      if (cand) out.push(cand)
    }
  }

  return out
}

/** 从 script 文本中提取 __INITIAL_STATE__ 的图片/视频 URL */
function fromScriptExtract(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const cdnRe = /(https?:\/\/[^"'\\s]*(?:xhscdn\.com|ci\.xiaohongshu\.com)[^"'\\s]*)/gi

  for (const s of Array.from(document.querySelectorAll<HTMLImageElement>('script'))) {
    const txt = s.textContent || ''
    if (!txt.includes('__INITIAL_STATE__')) continue
    const hits = txt.match(cdnRe) || []
    for (const hit of hits) {
      const abs = toAbsoluteUrl(hit, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.6,
        site: 'xiaohongshu'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

export function resolveXiaohongshuCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const host = location.hostname.toLowerCase()
  if (!(host.includes('xiaohongshu.com') || host.endsWith('xhslink.com'))) return []

  return dedupeCandidates([
    ...fromOgMeta(pageUrl, pageTitle),
    ...fromInitialImages(pageUrl, pageTitle),
    ...fromInitialVideo(pageUrl, pageTitle),
    ...fromDomMedia(pageUrl, pageTitle),
    ...fromScriptExtract(pageUrl, pageTitle)
  ])
}
