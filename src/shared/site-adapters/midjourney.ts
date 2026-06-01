import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const MJ_CDN_HOST = 'cdn.midjourney.com'

/** 清理 MJ 图片 URL：移除下载后缀、格式转换等 */
function cleanMjUrl(raw: string): string {
  let url = raw
  // 移除 _d0, _d1, _d2, _d3 等下载变体后缀
  url = url.replace(/_d\d+(?=\.)/gi, '')
  // webp → png（MJ 原图通常是 PNG，webp 是转换产物）
  url = url.replace(/\.webp(\?|$)/gi, '.png$1')
  return url
}

/** 检测是否可能是网格图 URL */
function isGridLike(url: string): boolean {
  try {
    const p = new URL(url).pathname.toLowerCase()
    // 网格图路径特征
    if (/grid/.test(p)) return true
  } catch { /* noop */ }
  return false
}

function fromCdnImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []

  // 直接扫描 MJ CDN 图片
  for (const img of Array.from(document.querySelectorAll('img'))) {
    const src = img.src ||
      img.getAttribute('data-src') ||
      img.getAttribute('srcset')?.split(',').pop()?.trim().split(/\s+/)?.[0] ||
      ''
    if (!src || !MJ_CDN_HOST.test(src)) continue

    const cleaned = cleanMjUrl(src)
    const abs = toAbsoluteUrl(cleaned, pageUrl)
    if (!abs) continue
    const gridFlag = isGridLike(abs)

    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: gridFlag ? 0.7 : 0.85,
      site: 'midjourney'
    })
    if (cand) out.push(cand)
  }

  return out
}

function fromAnchorLinks(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // MJ 页面中链接也可能指向图片
  for (const a of Array.from(document.querySelectorAll('a[href*="midjourney.com"]'))) {
    const href = a.getAttribute('href') || ''
    if (!href || /\.(png|jpg|jpeg|webp|gif)(\?|$)/i.test(href)) continue

    const cleaned = cleanMjUrl(href)
    const abs = toAbsoluteUrl(cleaned, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.62,
      site: 'midjourney'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromOgMeta(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const sel of ['meta[property="og:image"]', 'meta[name="og:image"]']) {
    const content = document.querySelector(sel)?.getAttribute('content') || ''
    if (!content) continue
    const cleaned = cleanMjUrl(content)
    const abs = toAbsoluteUrl(cleaned, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.78,
      site: 'midjourney'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromScriptExtract(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const mjUrlRe = /https?:\/\/cdn\.midjourney\.com[^\s"'\\<>]*/gi

  for (const s of Array.from(document.querySelectorAll('script'))) {
    const txt = s.textContent || ''
    if (!txt.includes(MJ_CDN_HOST)) continue
    const hits = txt.match(mjUrlRe) || []
    for (const hit of hits) {
      const cleaned = cleanMjUrl(hit)
      const abs = toAbsoluteUrl(cleaned, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.58,
        site: 'midjourney'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromPromptText(): string | null {
  // MJ prompt 可能在以下元素中
  const selectors = ['.prompt-text', '.prompt', '[data-prompt]', '.mj-prompt']
  for (const sel of selectors) {
    const el = document.querySelector(sel)
    if (el?.textContent?.trim()) return el.textContent.trim()
  }
  return null
}

export function resolveMidjourneyCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const host = location.hostname.toLowerCase()
  if (!host.includes('midjourney.com')) return []

  return dedupeCandidates([
    ...fromOgMeta(pageUrl, pageTitle),
    ...fromCdnImages(pageUrl, pageTitle),
    ...fromAnchorLinks(pageUrl, pageTitle),
    ...fromScriptExtract(pageUrl, pageTitle)
  ])
}
