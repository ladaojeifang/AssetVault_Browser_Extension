import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

function pullAdaptiveFormats(): Array<{ url: string; mime?: string }> {
  const w = window as typeof window & {
    ytInitialPlayerResponse?: {
      streamingData?: {
        adaptiveFormats?: Array<{
          url?: string
          signatureCipher?: string
          cipher?: string
          mimeType?: string
        }>
      }
    }
  }
  const formats = w.ytInitialPlayerResponse?.streamingData?.adaptiveFormats ?? []
  return formats
    .map((f) => {
      const cipher = f.signatureCipher || f.cipher || ''
      let fromCipher = ''
      if (cipher) {
        try {
          fromCipher = new URLSearchParams(cipher).get('url') || ''
        } catch {
          fromCipher = ''
        }
      }
      return { url: f.url || fromCipher || '', mime: f.mimeType }
    })
    .filter((f) => !!f.url)
}

export function resolveYoutubeCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  if (!/youtube\.com|youtu\.be/i.test(location.hostname)) return []
  const out: MediaCandidate[] = []

  for (const row of pullAdaptiveFormats()) {
    const abs = toAbsoluteUrl(row.url, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      mime: row.mime,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.86,
      site: 'youtube'
    })
    if (cand) out.push(cand)
  }

  for (const video of Array.from(document.querySelectorAll('video'))) {
    const abs = toAbsoluteUrl(video.currentSrc || video.src || '', pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      duration: Number.isFinite(video.duration) ? video.duration : undefined,
      confidence: 0.7,
      site: 'youtube'
    })
    if (cand) out.push(cand)
  }

  return dedupeCandidates(out)
}
