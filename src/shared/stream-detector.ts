import type { MediaCandidate } from './types'
import {
  dedupeCandidates,
  inferSourceType,
  makeMediaCandidate,
  toAbsoluteUrl
} from './media-candidate-core'

function fromVideoTags(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const video of Array.from(document.querySelectorAll('video'))) {
    const direct = [video.currentSrc, video.src]
    for (const raw of direct) {
      if (!raw) continue
      const abs = toAbsoluteUrl(raw, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        mime: video.getAttribute('type') || undefined,
        duration: Number.isFinite(video.duration) ? video.duration : undefined,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.82
      })
      if (cand) out.push(cand)
    }

    for (const source of Array.from(video.querySelectorAll('source'))) {
      const raw = source.src || source.getAttribute('src') || ''
      const abs = toAbsoluteUrl(raw, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        mime: source.type || undefined,
        duration: Number.isFinite(video.duration) ? video.duration : undefined,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.78
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromAnchors(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const a of Array.from(document.querySelectorAll('a[href]'))) {
    const href = a.getAttribute('href') || ''
    const abs = toAbsoluteUrl(href, pageUrl)
    if (!abs) continue
    if (!inferSourceType(abs)) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.56
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromPerformance(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
  for (const r of entries) {
    const url = r.name || ''
    if (!url) continue
    const sourceType = inferSourceType(url)
    if (!sourceType) continue
    const cand = makeMediaCandidate({
      url,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: sourceType === 'hls_manifest' ? 0.72 : 0.5
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromScriptText(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const scripts = Array.from(document.querySelectorAll('script'))
  const urlRe =
    /https?:\/\/[^\s"'\\]+?(?:\.m3u8(?:\?[^\s"'\\]*)?|\.mp4(?:\?[^\s"'\\]*)?|\/videoplayback\?[^\s"'\\]+|\/ext_tw_video\/[^\s"'\\]+|\/amplify_video\/[^\s"'\\]+|bilivideo\.com[^\s"'\\]+)/gi
  for (const s of scripts) {
    const txt = s.textContent || ''
    if (!txt) continue
    const hits = txt.match(urlRe) || []
    for (const hit of hits) {
      const cand = makeMediaCandidate({
        url: hit,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: /\.m3u8/i.test(hit) ? 0.8 : 0.72
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

export function scanPageMediaDeepGeneric(
  pageUrl = location.href,
  pageTitle = document.title
): MediaCandidate[] {
  return dedupeCandidates([
    ...fromVideoTags(pageUrl, pageTitle),
    ...fromAnchors(pageUrl, pageTitle),
    ...fromPerformance(pageUrl, pageTitle),
    ...fromScriptText(pageUrl, pageTitle),
    ...fromVimeoPlayer(pageUrl, pageTitle),
    ...fromInstagramReels(pageUrl, pageTitle),
    ...fromXiaohongshuVideo(pageUrl, pageTitle),
    ...fromPinterestVideoPin(pageUrl, pageTitle)
  ])
}

// ─── Site-specific video detection helpers ────────────────────────────────

/** Vimeo: detect embedded player sources (data-config / iframe src). */
function fromVimeoPlayer(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const host = (() => { try { return new URL(pageUrl).hostname.toLowerCase() } catch { return '' } })()
  if (!/vimeo\.com/i.test(host)) return out

  // Vimeo often embeds progressive URLs in <video> tags or data attributes
  for (const video of Array.from(document.querySelectorAll('video'))) {
    for (const raw of [video.currentSrc, video.src]) {
      if (!raw) continue
      const abs = toAbsoluteUrl(raw, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        mime: video.getAttribute('type') || undefined,
        duration: Number.isFinite(video.duration) ? video.duration : undefined,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.85,
        site: 'generic' as const
      })
      if (cand) out.push(cand)
    }
  }

  // Vimeo config in script JSON
  const vimeoConfigRe =
    /"progressive"\s*:\s*\[.*?"url"\s*:\s*"([^"]+?)"/is
  for (const s of Array.from(document.querySelectorAll('script'))) {
    const txt = s.textContent || ''
    if (!txt.includes('vimeo')) continue
    const m = txt.match(vimeoConfigRe)
    if (m?.[1]) {
      const abs = toAbsoluteUrl(m[1], pageUrl)
      if (abs) {
        const cand = makeMediaCandidate({
          url: abs,
          pageUrl,
          pageTitle,
          referer: pageUrl,
          confidence: 0.88,
          site: 'generic' as const
        })
        if (cand) out.push(cand)
      }
    }
  }

  return out
}

/** Instagram Reels / Video posts: extract CDN video URLs from __initialData. */
function fromInstagramReels(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const host = (() => { try { return new URL(pageUrl).hostname.toLowerCase() } catch { return '' } })()
  if (!/instagram\.com/i.test(host)) return out

  // Instagram embeds video URLs in <video> elements with high confidence
  for (const video of Array.from(document.querySelectorAll('video'))) {
    for (const raw of [video.currentSrc, video.src]) {
      if (!raw) continue
      const abs = toAbsoluteUrl(raw, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        mime: video.getAttribute('type') || undefined,
        duration: Number.isFinite(video.duration) ? video.duration : undefined,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.9,
        site: 'instagram' as const
      })
      if (cand) out.push(cand)
    }
  }

  // Also check meta og:video tags
  for (const sel of ['meta[property="og:video"]', 'meta[property="og:video:url"]']) {
    const content = document.querySelector(sel)?.getAttribute('content') || ''
    if (!content) continue
    const abs = toAbsoluteUrl(content, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.82,
      site: 'instagram' as const
    })
    if (cand) out.push(cand)
  }

  return out
}

/** Xiaohongshu (Little Red Book) video stream detection. */
function fromXiaohongshuVideo(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const host = (() => { try { return new URL(pageUrl).hostname.toLowerCase() } catch { return '' } })()
  if (!/xiaohongshu\.com|xhscdn\.com/i.test(host)) return out

  // Xiaohongshu serves videos via <video> with CDN URLs (snssdk / xhscdn)
  for (const video of Array.from(document.querySelectorAll('video'))) {
    for (const raw of [video.currentSrc, video.src]) {
      if (!raw) continue
      const abs = toAbsoluteUrl(raw, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        mime: video.getAttribute('type') || undefined,
        duration: Number.isFinite(video.duration) ? video.duration : undefined,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.88,
        site: 'generic' as const
      })
      if (cand) out.push(cand)
    }
  }

  // XHS video URLs in script JSON payload (common pattern: "url":"https://...xhscdn...")
  const xhsVideoRe = /https?:\/\/[^"'\\s]*?xhscdn\.com[^"'\\s]*?\.(mp4|m3u8)(\?[^\s"'\\]*)?/gi
  for (const s of Array.from(document.querySelectorAll('script'))) {
    const txt = s.textContent || ''
    if (!txt.includes('xhs') && !txt.includes('xiaohongshu')) continue
    const hits = txt.match(xhsVideoRe) || []
    for (const hit of hits) {
      const abs = toAbsoluteUrl(hit, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: /\.m3u8/i.test(hit) ? 0.84 : 0.86,
        site: 'generic' as const
      })
      if (cand) out.push(cand)
    }
  }

  return out
}

/** Pinterest Video Pin: detect video pin streams. */
function fromPinterestVideoPin(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const host = (() => { try { return new URL(pageUrl).hostname.toLowerCase() } catch { return '' } })()
  if (!/pinterest\./i.test(host)) return out

  // Pinterest uses <video> tags for video pins with CDN URLs
  for (const video of Array.from(document.querySelectorAll('video'))) {
    for (const raw of [video.currentSrc, video.src]) {
      if (!raw) continue
      const abs = toAbsoluteUrl(raw, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        mime: video.getAttribute('type') || undefined,
        duration: Number.isFinite(video.duration) ? video.duration : undefined,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.87,
        site: 'pinterest' as const
      })
      if (cand) out.push(cand)
    }
  }

  // Pinterest video URLs in __P_INITIAL_DATA or script tags
  const pinVideoRe =
    /https?:\/\/[^"'\\s]*?(?:pinimg\.com|pinterest\.com)[^"'\\s]*?\.(mp4|m3u8)(\?[^\s'"\\]*)?|https?:\/\/i\.ytimg\.com\/vi\/[^"'\s]+/gi
  for (const s of Array.from(document.querySelectorAll('script'))) {
    const txt = s.textContent || ''
    if (!txt.includes('video') && !txt.includes('pin')) continue
    const hits = txt.match(pinVideoRe) || []
    for (const hit of hits) {
      const abs = toAbsoluteUrl(hit, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: /\.m3u8/i.test(hit) ? 0.8 : 0.83,
        site: 'pinterest' as const
      })
      if (cand) out.push(cand)
    }
  }

  return out
}

// ─── Usage notes for bypassFetch & ConcurrencyQueue ───────────────────────
//
// When downloading media from sites with anti-hotlinking protection:
//
//   import { bypassFetch } from './bypass-fetch'
//   import { ConcurrencyQueue } from './concurrency'
//
//   const queue = new ConcurrencyQueue(4)
//   for (const candidate of candidates) {
//     await queue.add(async () => {
//       const blob = await bypassFetch(candidate.url, { referer: candidate.referer })
//       // process blob ...
//     })
//   }
//
// bypassFetch handles Referer spoofing, cookie forwarding, and common
// anti-hotlink countermeasures (403 redirect loops, CORS blocks).
// ConcurrencyQueue limits parallel downloads to avoid rate-limiting and
// browser tab throttling.

