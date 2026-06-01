import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

function fromMetaTags(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    'meta[property="og:video"]',
    'meta[property="og:video:url"]',
    'meta[name="twitter:player:stream"]'
  ]
  for (const sel of selectors) {
    const content = document.querySelector(sel)?.getAttribute('content') || ''
    const abs = toAbsoluteUrl(content, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.78,
      site: 'twitter'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromVideoElements(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const video of Array.from(document.querySelectorAll<HTMLVideoElement>('video'))) {
    for (const src of [video.currentSrc, video.src]) {
      const abs = toAbsoluteUrl(src || '', pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        duration: Number.isFinite(video.duration) ? video.duration : undefined,
        confidence: 0.82,
        site: 'twitter'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromScriptVariants(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const re =
    /https?:\/\/video\.twimg\.com\/[^\s"'\\]+?(?:\.m3u8(?:\?[^\s"'\\]*)?|\.mp4(?:\?[^\s"'\\]*)?|\/ext_tw_video\/[^\s"'\\]+|\/amplify_video\/[^\s"'\\]+)/gi
  for (const s of Array.from(document.querySelectorAll<HTMLImageElement>('script'))) {
    const txt = s.textContent || ''
    if (!txt) continue
    const hits = txt.match(re) || []
    for (const hit of hits) {
      const abs = toAbsoluteUrl(hit, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: /\.m3u8/i.test(abs) ? 0.82 : 0.76,
        site: 'twitter'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

export function resolveTwitterCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  if (!/x\.com|twitter\.com/i.test(location.hostname)) return []
  return dedupeCandidates([
    ...fromMetaTags(pageUrl, pageTitle),
    ...fromVideoElements(pageUrl, pageTitle),
    ...fromScriptVariants(pageUrl, pageTitle)
  ])
}
