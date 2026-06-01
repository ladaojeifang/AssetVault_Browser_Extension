import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

function fromMetaTags(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // Video meta tags (Reels)
  const videoSelectors = [
    'meta[property="og:video"]',
    'meta[property="og:video:url"]',
    'meta[property="og:video:secure_url"]',
    'meta[name="video:secure_url"]'
  ]
  for (const sel of videoSelectors) {
    const content = document.querySelector(sel)?.getAttribute('content') || ''
    const abs = toAbsoluteUrl(content, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.86,
      site: 'instagram'
    })
    if (cand) out.push(cand)
  }

  // Image meta tags (posts, carousel)
  const imageSelectors = [
    'meta[property="og:image"]',
    'meta[name="twitter:image"]'
  ]
  for (const sel of imageSelectors) {
    const content = document.querySelector(sel)?.getAttribute('content') || ''
    const abs = toAbsoluteUrl(content, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.78,
      site: 'instagram'
    })
    if (cand) out.push(cand)
  }

  return out
}

function fromLdJson(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const s of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    const txt = s.textContent || ''
    let items: unknown
    try {
      items = JSON.parse(txt)
    } catch {
      continue
    }
    // Normalize to array
    const arr = Array.isArray(items) ? items : [items]

    function extractMedia(obj: unknown) {
      if (!obj || typeof obj !== 'object') return
      const o = obj as Record<string, unknown>
      // ImageObject or VideoObject
      if (o['@type'] === 'ImageObject' && typeof o.contentUrl === 'string') {
        const abs = toAbsoluteUrl(o.contentUrl, pageUrl)
        if (abs) {
          const cand = makeMediaCandidate({
            url: abs,
            pageUrl,
            pageTitle,
            referer: pageUrl,
            confidence: 0.84,
            site: 'instagram'
          })
          if (cand) out.push(cand)
        }
      }
      if ((o['@type'] === 'VideoObject' || o['@type'] === 'VideoObject') && typeof o.contentUrl === 'string') {
        const abs = toAbsoluteUrl(o.contentUrl, pageUrl)
        if (abs) {
          const cand = makeMediaCandidate({
            url: abs,
            pageUrl,
            pageTitle,
            referer: pageUrl,
            confidence: 0.85,
            site: 'instagram'
          })
          if (cand) out.push(cand)
        }
      }
      // Recurse into nested objects/arrays
      for (const v of Object.values(o)) {
        if (Array.isArray(v)) {
          v.forEach(extractMedia)
        } else if (typeof v === 'object' && v !== null) {
          extractMedia(v)
        }
      }
    }
    arr.forEach(extractMedia)
  }
  return out
}

function fromArticleMedia(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // Images in article (post detail / carousel)
  for (const img of Array.from(document.querySelectorAll('article img'))) {
    const src = img.getAttribute('src') || img.currentSrc || ''
    if (!src || src.startsWith('data:') || !src.includes('cdninstagram.com')) continue
    const abs = toAbsoluteUrl(src, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.76,
      site: 'instagram'
    })
    if (cand) out.push(cand)
  }

  // Video elements (Reels, Stories)
  for (const video of Array.from(document.querySelectorAll('article video, video'))) {
    for (const src of [video.currentSrc, video.src]) {
      const abs = toAbsoluteUrl(src || '', pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        duration: Number.isFinite(video.duration) ? video.duration : undefined,
        confidence: 0.84,
        site: 'instagram'
      })
      if (cand) out.push(cand)
    }
    // Video source tags
    for (const source of Array.from(video.querySelectorAll('source[src]'))) {
      const src = source.getAttribute('src') || ''
      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.82,
        site: 'instagram'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromScriptEmbedded(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // Instagram CDN patterns in embedded scripts
  const cdnRe = /https?:\/\/(?:[^/]*\.)?(?:cdninstagram\.com|fbcdn\.net)[^\s"'\\]+?\.(?:mp4|jpg|jpeg|png|gif)(\?[^\s"'\\]*)?/gi
  for (const s of Array.from(document.querySelectorAll('script'))) {
    const txt = s.textContent || ''
    if (!txt) continue
    const hits = txt.match(cdnRe) || []
    for (const hit of hits) {
      const abs = toAbsoluteUrl(hit, pageUrl)
      if (!abs) continue
      const isVideo = /\.mp4/i.test(abs)
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: isVideo ? 0.8 : 0.74,
        site: 'instagram'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

export function resolveInstagramCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  if (!/instagram\.com/i.test(location.hostname)) return []
  return dedupeCandidates([
    ...fromMetaTags(pageUrl, pageTitle),
    ...fromLdJson(pageUrl, pageTitle),
    ...fromArticleMedia(pageUrl, pageTitle),
    ...fromScriptEmbedded(pageUrl, pageTitle)
  ])
}
