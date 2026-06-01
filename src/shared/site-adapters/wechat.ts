import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const WECHAT_HOST_RE = /mp\.weixin\.qq\.com|weixin\.qq\.com/i

/**
 * Extract image candidates from WeChat Official Account articles (mp.weixin.qq.com).
 *
 * WeChat articles use aggressive lazy-loading: <img src="base64-GIF" data-src="real-mmbiz-url">
 * This adapter ensures those data-src URLs are captured even if generic scanning misses them.
 */
export function resolveWechatCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  try {
    if (!WECHAT_HOST_RE.test(location.hostname)) return []
  } catch {
    return []
  }

  return dedupeCandidates([
    ...fromOgMeta(pageUrl, pageTitle),
    ...fromArticleImages(pageUrl, pageTitle),
    ...fromScriptExtraction(pageUrl, pageTitle),
    ...fromDomScan(pageUrl, pageTitle)
  ])
}

/* ── og:image / Twitter card meta ─────────────────────────────────── */

function fromOgMeta(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const sel of [
    'meta[property="og:image"]',
    'meta[name="og:image"]',
    'meta[name="twitter:image"]'
  ]) {
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
      confidence: 0.8,
      site: 'wechat'
    })
    if (cand) out.push(cand)
  }
  return out
}

/* ── Article body images (data-src + mmbiz CDN) ────────────────────── */

function fromArticleImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // WeChat article content is usually inside #js_content or .rich_media_content
  const containers = [
    document.querySelector('#js_content'),
    document.querySelector('.rich_media_content'),
    document.querySelector('div[ id="img-list"]'),
    document.body
  ].filter((el): el is HTMLElement => el != null)

  for (const root of containers) {
    const imgs = root.querySelectorAll('img')
    for (const img of Array.from(imgs)) {
      if (!(img instanceof HTMLImageElement)) continue

      // Priority order: data-src > data-originalsrc > currentSrc > src
      let raw = img.getAttribute('data-src')
        || img.getAttribute('data-originalsrc')
        || img.getAttribute('data-mmsrc')
        || img.currentSrc
        || img.src
        || ''

      // Skip base64 placeholder GIF used by WeChat's lazy loader
      if (/^data:image\/gif/i.test(raw)) {
        raw = img.getAttribute('data-src') || ''
      }
      if (!raw || !/^https?:\/\//i.test(raw)) continue

      // Only collect mmbiz / WeChat CDN URLs in this path (generic scan handles others)
      if (!/mmbiz\.qpic|qpic\.cn|wechat|weixin\.qq/i.test(raw)) continue

      const abs = toAbsoluteUrl(raw, pageUrl)
      if (!abs) continue

      const w = img.naturalWidth || img.width
        || Number(img.getAttribute('data-w')) || undefined
      const h = img.naturalHeight || img.height
        || Number(img.getAttribute('data-h')) || undefined

      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: w && w > 200 ? 0.92 : 0.85,
        site: 'wechat'
      })
      if (cand) {
        if (w !== undefined && h !== undefined) {
          Object.assign(cand, { widthHint: w, heightHint: h } as Record<string, unknown>)
          // Note: widthHint not part of MediaCandidate type but useful for UI
        }
        out.push(cand)
      }
    }
  }
  return out
}

/* ── Extract mmbiz URLs from inline script / JSON data ─────────────── */

function fromScriptExtraction(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const cdnRe = /(https?:\/\/[^"'\s<>]*(?:mmbiz\.qpic|qpic\.cn)[^"'\s<>]*)/gi

  for (const s of Array.from(document.querySelectorAll('script'))) {
    const txt = s.textContent || ''
    if (!txt.includes('mmbiz') && !txt.includes('qpic')) continue

    const hits = txt.match(cdnRe) || []
    for (const hit of hits) {
      const abs = toAbsoluteUrl(hit, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.7,
        site: 'wechat'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

/* ── Fallback: DOM-wide scan for any mmbiz resource ────────────────── */

function fromDomScan(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []

  // Check background-image styles that might contain mmbiz URLs
  for (const el of Array.from(document.querySelectorAll('[style*="background"]'))) {
    if (!(el instanceof HTMLElement)) continue
    try {
      const bg = getComputedStyle(el).backgroundImage
      if (!bg || bg === 'none') continue
      const m = bg.match(/url\(["']?([^"')]+)["']?\)/)
      if (m?.[1] && /mmbiz|qpic\.cn/i.test(m[1])) {
        const abs = toAbsoluteUrl(m[1], pageUrl)
        if (abs) {
          const cand = makeMediaCandidate({
            url: abs,
            pageUrl,
            pageTitle,
            referer: pageUrl,
            confidence: 0.6,
            site: 'wechat'
          })
          if (cand) out.push(cand)
        }
      }
    } catch {
      /* cross-origin style access */
    }
  }

  // Check video poster attributes
  for (const v of Array.from(document.querySelectorAll('video'))) {
    const poster = v.poster || ''
    if (/mmbiz|qpic\.cn/i.test(poster)) {
      const abs = toAbsoluteUrl(poster, pageUrl)
      if (abs) {
        const cand = makeMediaCandidate({
          url: abs,
          pageUrl,
          pageTitle,
          referer: pageUrl,
          confidence: 0.65,
          site: 'wechat'
        })
        if (cand) out.push(cand)
      }
    }
  }

  return out
}
