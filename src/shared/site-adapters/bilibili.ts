import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

type BilibiliPlayInfo = {
  data?: {
    dash?: {
      video?: Array<{ baseUrl?: string; base_url?: string; mimeType?: string }>
    }
    durl?: Array<{ url?: string }>
  }
}

function resolvePlayInfo(): BilibiliPlayInfo | null {
  const w = window as typeof window & { __playinfo__?: BilibiliPlayInfo }
  if (w.__playinfo__) return w.__playinfo__
  return null
}

export function resolveBilibiliCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  if (!/bilibili\.com/i.test(location.hostname)) return []
  const out: MediaCandidate[] = []
  const pi = resolvePlayInfo()

  for (const row of pi?.data?.dash?.video ?? []) {
    const abs = toAbsoluteUrl(row.baseUrl || row.base_url || '', pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      mime: row.mimeType,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.86,
      site: 'bilibili'
    })
    if (cand) out.push(cand)
  }
  for (const row of pi?.data?.durl ?? []) {
    const abs = toAbsoluteUrl(row.url || '', pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.8,
      site: 'bilibili'
    })
    if (cand) out.push(cand)
  }
  for (const v of Array.from(document.querySelectorAll<HTMLVideoElement>('video'))) {
    const abs = toAbsoluteUrl(v.currentSrc || v.src || '', pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      duration: Number.isFinite(v.duration) ? v.duration : undefined,
      confidence: 0.7,
      site: 'bilibili'
    })
    if (cand) out.push(cand)
  }
  return dedupeCandidates(out)
}
