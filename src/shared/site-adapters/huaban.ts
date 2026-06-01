import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

/** 花瓣 CDN 域名匹配 */
const HUABAN_CDN_RE = /hbimg\.huabanimg\.com|hbimg\.huaban\.com|gd-hbimg-edge/i

function fromPinJsonLd(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []

  // 花瓣 Pin 页面通常有 JSON-LD 数据
  const jsonLd = document.querySelector('script[type="application/ld+json"]')
  if (!jsonLd) return out

  try {
    const data = JSON.parse(jsonLd.textContent || '{}')
    const imageUrl = data.image || data.thumbnailURL || data.contentUrl || ''
    if (imageUrl) {
      const abs = toAbsoluteUrl(imageUrl, pageUrl)
      if (abs) {
        const cand = makeMediaCandidate({
          url: abs,
          pageUrl,
          pageTitle,
          referer: pageUrl,
          confidence: 0.85,
          site: 'huaban'
        })
        if (cand) out.push(cand)
      }
    }
  } catch { /* ignore parse errors */ }

  return out
}

function fromDomImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    '.pin-board img[src*="hbimg"]',
    '.image-holder img',
    '.b-image img[src*="hbimg"]',
    '.pin-img img',
    '.waterfall-item img[src*="hbimg"]',
    'img[src*="hbimg.huabanimg.com"]',
    'img[src*="hbimg.huaban.com"]'
  ]

  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll(sel))) {
      const src =
        img.src ||
        img.getAttribute('data-src') ||
        img.getAttribute('data-original') ||
        img.getAttribute('data-url') ||
        ''
      if (!src || !HUABAN_CDN_RE.test(src)) continue

      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.8,
        site: 'huaban'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromOgMeta(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const sel of [
    'meta[property="og:image"]',
    'meta[name="og:image"]',
    'meta[property="twitter:image"]'
  ]) {
    const content = document.querySelector(sel)?.getAttribute('content') || ''
    if (!content) continue
    const abs = toAbsoluteUrl(content, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.72,
      site: 'huaban'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromPageScript(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // 匹配花瓣 CDN 图片 URL
  const hbImgRe = /https?:\/\/[^\s"'\\<>]*(?:hbimg\.huabanimg\.com|hbimg\.huaban\.com)[^\s"'\\<>]*/gi

  for (const s of Array.from(document.querySelectorAll('script'))) {
    const txt = s.textContent || ''
    if (!HUABAN_CDN_RE.test(txt)) continue
    const hits = txt.match(hbImgRe) || []
    for (const hit of hits) {
      const abs = toAbsoluteUrl(hit, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.58,
        site: 'huaban'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromBackgroundImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // 花瓣有时用 background-image 显示大图
  const bgSelectors = [
    '.pin-board',
    '.image-holder',
    '.pin-img',
    '.waterfall-item .img'
  ]

  for (const sel of bgSelectors) {
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const style = el.style.backgroundImage || ''
      const match = style.match(/url\(["']?(.*?)["']?\)/i)
      const rawUrl = match ? match[1] : ''
      if (!rawUrl || !HUABAN_CDN_RE.test(rawUrl)) continue

      const abs = toAbsoluteUrl(rawUrl, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.68,
        site: 'huaban'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

export function resolveHuabanCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const host = location.hostname.toLowerCase()
  if (!host.includes('huaban.com')) return []

  return dedupeCandidates([
    ...fromPinJsonLd(pageUrl, pageTitle),
    ...fromOgMeta(pageUrl, pageTitle),
    ...fromDomImages(pageUrl, pageTitle),
    ...fromBackgroundImages(pageUrl, pageTitle),
    ...fromPageScript(pageUrl, pageTitle)
  ])
}
