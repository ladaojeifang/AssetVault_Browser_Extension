import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

/**
 * 微博图片 URL 尺寸后缀排序（从小到大）。
 * 替换为更大的后缀以获取高清图。
 */
const WEIBO_SIZE_SUFFIXES = [
  'thumb150',
  'thumb180',
  'mw200',
  'mw320',
  'mw480',
  'mw600',
  'mw720',
  'orj360',
  'orj480',
  'mw1024',
  'mw2048',
  'large',
  'orj1080'
]

function enlargeImageUrl(raw: string): string {
  let url = raw
  // 将已知的小尺寸后缀替换为 large（或 orj1080）
  for (const suffix of WEIBO_SIZE_SUFFIXES) {
    // 匹配模式如 .jpg/thumb150 或 _thumb150.jpg
    if (url.includes(suffix)) {
      url = url.replace(new RegExp(`(${escapeRe(suffix)})`, 'g'), 'large')
      break
    }
  }
  return url
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function fromSinaImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    '.wbpro-picture img',
    '.media-box img',
    '.pic-box img',
    '.photo-list img',
    '.img-box img',
    'img[src*="sinaimg.cn"]',
    'img[src*="weibo.com"]'
  ]

  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(sel))) {
      const src = img.src ||
        img.getAttribute('data-src') ||
        img.getAttribute('data-original') ||
        img.getAttribute('data-url') ||
        ''
      if (!src || !/sinaimg\.cn/.test(src)) continue

      const enlarged = enlargeImageUrl(src)
      const abs = toAbsoluteUrl(enlarged, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.82,
        site: 'weibo'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromOgMeta(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const sel of ['meta[property="og:image"]', 'meta[name="og:image"]']) {
    const content = document.querySelector(sel)?.getAttribute('content') || ''
    if (!content) continue
    const enlarged = enlargeImageUrl(content)
    const abs = toAbsoluteUrl(enlarged, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.78,
      site: 'weibo'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromVideoElements(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []

  // 直接扫描 <video> 标签
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
        confidence: 0.76,
        site: 'weibo'
      })
      if (cand) out.push(cand)
    }
  }

  // 从 script 中提取 mp4/m3u8 URL
  const videoRe = /https?:\/\/(?:[^\s"'\\]*\.(?:mp4|m3u8)(?:\?[^\s"'\\]*)?)/gi
  for (const s of Array.from(document.querySelectorAll<HTMLImageElement>('script'))) {
    const txt = s.textContent || ''
    if (!/(mp4|m3u8)/i.test(txt)) continue
    const hits = txt.match(videoRe) || []
    for (const hit of hits) {
      const abs = toAbsoluteUrl(hit, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: /\.m3u8/i.test(abs) ? 0.74 : 0.7,
        site: 'weibo'
      })
      if (cand) out.push(cand)
    }
  }

  return out
}

function fromScriptImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // 匹配 sinaimg.cn 图片 URL
  const sinaImgRe = /https?:\/\/[a-z0-9]*\.?sinaimg\.cn[^\s"'\\<>]*/gi

  for (const s of Array.from(document.querySelectorAll<HTMLImageElement>('script'))) {
    const txt = s.textContent || ''
    if (!txt.includes('sinaimg')) continue
    const hits = txt.match(sinaImgRe) || []
    for (const hit of hits) {
      const enlarged = enlargeImageUrl(hit)
      const abs = toAbsoluteUrl(enlarged, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.62,
        site: 'weibo'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

export function resolveWeiboCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const host = location.hostname.toLowerCase()
  if (
    !host.includes('weibo.com') &&
    !host.includes('weibo.cn')
  ) return []

  return dedupeCandidates([
    ...fromOgMeta(pageUrl, pageTitle),
    ...fromSinaImages(pageUrl, pageTitle),
    ...fromVideoElements(pageUrl, pageTitle),
    ...fromScriptImages(pageUrl, pageTitle)
  ])
}
