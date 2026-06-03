/** Deep page scan: candidates, site adapters, HD enlargement → BoardSaverItem[]. */

import { collectPageImageCandidates, mergeImageCandidates } from '../shared/page-image-scanner'
import { runMatchingAdapters } from '../shared/site-adapters/index'
import { filenameFromUrl } from '../shared/collect-meta-core'
import { enlargeImageUrl } from '../shared/url-enlarger'
import type { BoardSaverItem } from './board-saver-types'
import { extractBoardSaverDomain } from './board-saver-utils'

const HD_CONCURRENCY = 6

export type ScanCollectOptions = {
  pageUrl: string
  pageTitle: string
  seenUrls: Set<string>
  totalItems: number
  maxItems: number
  nextId: () => string
}

export type ScanCollectResult = {
  newItems: BoardSaverItem[]
  totalItems: number
}

export async function collectBoardSaverItems(opts: ScanCollectOptions): Promise<ScanCollectResult> {
  const { pageUrl, pageTitle, seenUrls, maxItems, nextId } = opts
  let totalItems = opts.totalItems

  const candidates = collectPageImageCandidates(pageUrl, pageTitle)
  let merged = mergeImageCandidates(candidates)
  const adapterResults = runMatchingAdapters(pageUrl, pageTitle)
  for (const a of adapterResults) {
    if (a.kind === 'gif' || /\.(jpg|jpeg|png|webp|avif|bmp|svg)(\?|#|$)/i.test(a.url)) {
      merged.push({
        url: a.url,
        source: `adapter-${a.site}`,
        score: a.confidence,
        width: undefined,
        height: undefined,
      })
    }
  }

  const bgSeen = new Set(merged.map((c) => c.url))
  collectBackgroundImages(pageUrl, bgSeen, merged)
  collectBestSrcsetImages(pageUrl, bgSeen, merged)
  collectTwitterMedia(bgSeen, merged)
  collectInstagramCarousel(bgSeen, merged)
  collectInlineSvgs(bgSeen, merged)

  merged = mergeImageCandidates(merged)

  const hdMap = new Map<string, string>()
  for (let i = 0; i < merged.length; i += HD_CONCURRENCY) {
    const chunk = merged.slice(i, i + HD_CONCURRENCY)
    const results = await Promise.all(
      chunk.map(async (c) => {
        try {
          const hdUrl = await enlargeImageUrl(c.url)
          return { orig: c.url, hd: hdUrl }
        } catch {
          return { orig: c.url, hd: c.url }
        }
      }),
    )
    for (const r of results) hdMap.set(r.orig, r.hd)
  }

  const newItems: BoardSaverItem[] = []
  for (const c of merged) {
    const hdUrl = hdMap.get(c.url) || c.url
    if (seenUrls.has(hdUrl)) continue
    if (totalItems + newItems.length >= maxItems) break
    seenUrls.add(hdUrl)
    totalItems++
    const isEnlarged = hdUrl !== c.url
    newItems.push({
      id: nextId(),
      url: hdUrl,
      filename: filenameFromUrl(hdUrl),
      domain: extractBoardSaverDomain(hdUrl),
      width: c.width,
      height: c.height,
      selected: true,
      discoveredAt: Date.now(),
      source: c.source,
      isEnlarged,
    })
  }

  return { newItems, totalItems }
}

function collectBackgroundImages(
  pageUrl: string,
  bgSeen: Set<string>,
  merged: ReturnType<typeof mergeImageCandidates>,
): void {
  for (const el of Array.from(document.querySelectorAll('body, body *'))) {
    if (!(el instanceof HTMLElement)) continue
    try {
      const bg = getComputedStyle(el).backgroundImage
      if (!bg || bg === 'none') continue
      const m = bg.match(/url\(["']?([^"')]+)["']?\)/)
      if (!m?.[1] || /^data:/i.test(m[1]) || m[1].startsWith('blob:') || /gradient/i.test(bg)) continue
      let abs = m[1]
      try {
        abs = new URL(abs, pageUrl).href
      } catch {
        /* keep raw */
      }
      if (!bgSeen.has(abs) && /^https?:\/\//.test(abs)) {
        bgSeen.add(abs)
        merged.push({ url: abs, source: 'background', score: 0.55, width: undefined, height: undefined })
      }
    } catch {
      /* ignore */
    }
  }
}

function collectBestSrcsetImages(
  pageUrl: string,
  bgSeen: Set<string>,
  merged: ReturnType<typeof mergeImageCandidates>,
): void {
  for (const img of Array.from(document.querySelectorAll('img[srcset]'))) {
    if (!(img instanceof HTMLImageElement)) continue
    const srcset = img.getAttribute('srcset')
    if (!srcset) continue
    let bestUrl = ''
    let bestW = 0
    for (const part of srcset.split(',')) {
      const m = part.trim().match(/^(\S+)\s+(\d+)w\b/i)
      if (m) {
        const w = Number(m[2])
        if (w > bestW) {
          bestW = w
          bestUrl = m[1]
        }
        continue
      }
      const bare = part.trim().split(/\s+/)[0]
      if (bare.startsWith('http') && !bestUrl) bestUrl = bare
    }
    if (bestUrl) {
      try {
        bestUrl = new URL(bestUrl, pageUrl).href
      } catch {
        /* */
      }
      if (/^https?:\/\//.test(bestUrl) && !bgSeen.has(bestUrl)) {
        bgSeen.add(bestUrl)
        merged.push({
          url: bestUrl,
          source: 'srcset-best',
          score: 0.8,
          width: img.naturalWidth || undefined,
          height: img.naturalHeight || undefined,
        })
      }
    }
  }
}

function collectTwitterMedia(
  bgSeen: Set<string>,
  merged: ReturnType<typeof mergeImageCandidates>,
): void {
  if (!/x\.com|twitter\.com/i.test(location.hostname)) return
  const twSelectors = [
    '[data-testid="tweetPhoto"] img',
    'img[src*="pbs.twimg.com/media"]',
    'img[src*="twimg.com/media"]',
    'article img[src*="/media/"]',
  ]
  for (const sel of twSelectors) {
    for (const img of Array.from(document.querySelectorAll(sel))) {
      if (!(img instanceof HTMLImageElement)) continue
      const src = img.currentSrc || img.src
      if (!src || !/twimg\.com\/media\//i.test(src)) continue
      if (!bgSeen.has(src)) {
        bgSeen.add(src)
        merged.push({ url: src, source: 'twitter-media', score: 0.85, width: undefined, height: undefined })
      }
    }
  }
}

function collectInstagramCarousel(
  bgSeen: Set<string>,
  merged: ReturnType<typeof mergeImageCandidates>,
): void {
  if (!/instagram\.com/i.test(location.hostname)) return
  const igUrls = new Set<string>()
  for (const s of Array.from(document.querySelectorAll('script'))) {
    const txt = s.textContent || ''
    if (!txt.includes('display_url') && !txt.includes('carousel_media')) continue
    const cdnRe =
      /https?:\/\/(?:[^/]*\.)?(?:cdninstagram\.com|fbcdn\.net)[^"'\s\\]+?\.(?:jpg|jpeg|png|webp)(\?[^\s"'\\]*)?/gi
    for (const hit of txt.match(cdnRe) || []) {
      try {
        igUrls.add(new URL(hit).origin + new URL(hit).pathname.split('?')[0])
      } catch {
        igUrls.add(hit)
      }
    }
  }
  for (const url of igUrls) {
    if (!bgSeen.has(url) && url.length < 2000) {
      bgSeen.add(url)
      merged.push({ url, source: 'instagram-data', score: 0.82, width: undefined, height: undefined })
    }
  }
}

function collectInlineSvgs(
  bgSeen: Set<string>,
  merged: ReturnType<typeof mergeImageCandidates>,
): void {
  for (const svg of Array.from(document.querySelectorAll('svg'))) {
    try {
      const rect = svg.getBoundingClientRect()
      if (rect.width < 16 && rect.height < 16) continue
      const clone = svg.cloneNode(true) as SVGElement
      const xml = new XMLSerializer().serializeToString(clone)
      const dataUri = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)))
      if (dataUri.length > 500000) continue
      if (!bgSeen.has(dataUri)) {
        bgSeen.add(dataUri)
        merged.push({
          url: dataUri,
          source: 'svg-inline',
          score: 0.6,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        })
      }
    } catch {
      /* ignore */
    }
  }
}
