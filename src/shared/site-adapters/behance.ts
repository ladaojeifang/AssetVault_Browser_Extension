import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

const HOST_RE = /behance\.net/i

/** CDN domains used by Behance */
const BEHANCE_CDN_RE = /cdn-assets-all\.ftcdn\.net|mir-s3-www-cdn-ftresources\.ftcdn\.com/i

function fromOgImage(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const prop of ['og:image', 'og:image:url']) {
    const content = document.querySelector(`meta[property="${prop}"]`)?.getAttribute('content') || ''
    if (!content) continue
    const abs = toAbsoluteUrl(content, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.88,
      site: 'behance'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromJsonLd(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  for (const el of Array.from(document.querySelectorAll<HTMLImageElement>('script[type="application/ld+json"]'))) {
    let data: unknown
    try {
      data = JSON.parse(el.textContent || '')
    } catch {
      continue
    }
    // JSON-LD can be a single object or array
    const items = Array.isArray(data) ? data : [data]
    for (const item of items) {
      if (typeof item !== 'object' || !item) continue
      const obj = item as Record<string, unknown>
      // Extract image field
      const img = obj.image
      if (typeof img === 'string') {
        const abs = toAbsoluteUrl(img, pageUrl)
        if (abs) {
          const cand = makeMediaCandidate({
            url: abs,
            pageUrl,
            pageTitle,
            referer: pageUrl,
            confidence: 0.86,
            site: 'behance'
          })
          if (cand) out.push(cand)
        }
      } else if (Array.isArray(img)) {
        for (const i of img) {
          if (typeof i === 'string') {
            const abs = toAbsoluteUrl(i, pageUrl)
            if (abs) {
              const cand = makeMediaCandidate({
                url: abs,
                pageUrl,
                pageTitle,
                referer: pageUrl,
                confidence: 0.84,
                site: 'behance'
              })
              if (cand) out.push(cand)
            }
          } else if (i && typeof i === 'object') {
            const urlStr = (i as Record<string, unknown>).url as string | undefined
            if (urlStr) {
              const abs = toAbsoluteUrl(urlStr, pageUrl)
              if (abs) {
                const cand = makeMediaCandidate({
                  url: abs,
                  pageUrl,
                  pageTitle,
                  referer: pageUrl,
                  confidence: 0.84,
                  site: 'behance'
                })
                if (cand) out.push(cand)
              }
            }
          }
        }
      }
    }
  }
  return out
}

function fromProjectModules(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // Behance project module images - these are the main showcase images
  const selectors = [
    '.project-modules img',
    '.image-element img',
    '.project-cover img',
    '[data-behance-project-module] img'
  ]
  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(sel))) {
      const src = img.getAttribute('src') || img.dataset.src || ''
      if (!src) continue
      // Skip tiny thumbnails and decorative images
      if (src.includes('1x1.') || src.includes('spacer')) continue
      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.90,
        site: 'behance'
      })
      if (cand) out.push(cand)
    }
  }
  return out
}

function fromCdnImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // Catch any CDN-hosted Behance images that weren't caught by selectors above
  for (const img of Array.from(document.querySelectorAll<HTMLImageElement>('img'))) {
    const src = img.getAttribute('src') || ''
    if (!BEHANCE_CDN_RE.test(src)) continue
    if (src.includes('1x1.') || src.includes('spacer') || src.includes('avatar')) continue
    const abs = toAbsoluteUrl(src, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.78,
      site: 'behance'
    })
    if (cand) out.push(cand)
  }
  return out
}

function fromEmbeddedData(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // Check for embedded JSON data in script tags
  for (const s of Array.from(document.querySelectorAll<HTMLImageElement>('script'))) {
    const txt = s.textContent || ''
    // Look for project image data in various formats Behance uses
    if (txt.includes('cdn-assets-all.ftcdn.net') || txt.includes('mir-s3-www-cdn-ftresources')) {
      const re = /https?:\/\/(?:cdn-assets-all\.ftcdn\.net|mir-s3-www-cdn-ftresources\.ftcdn\.com)[^\s"'\\<>]+?\.(?:jpg|jpeg|png|gif|webp)(\?[^\s"'\\<>]*)?/gi
      const hits = txt.match(re) || []
      for (const hit of hits) {
        if (hit.includes('1x1.') || hit.includes('spacer') || hit.includes('avatar')) continue
        const abs = toAbsoluteUrl(hit, pageUrl)
        if (!abs) continue
        const cand = makeMediaCandidate({
          url: abs,
          pageUrl,
          pageTitle,
          referer: pageUrl,
          confidence: 0.82,
          site: 'behance'
        })
        if (cand) out.push(cand)
      }
    }
  }
  return out
}

export function resolveBehanceCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  try {
    if (!HOST_RE.test(location.hostname)) return []
  } catch { return [] }

  return dedupeCandidates([
    ...fromOgImage(pageUrl, pageTitle),
    ...fromJsonLd(pageUrl, pageTitle),
    ...fromProjectModules(pageUrl, pageTitle),
    ...fromCdnImages(pageUrl, pageTitle),
    ...fromEmbeddedData(pageUrl, pageTitle),
  ])
}
