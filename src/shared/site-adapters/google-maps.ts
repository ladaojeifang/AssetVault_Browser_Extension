/**
 * Google Maps / Street View adapter.
 *
 * Most Google Maps content is rendered via Canvas/WebGL, so traditional DOM
 * scanning has limited effectiveness. This adapter focuses on:
 * 1. POI photos from static image CDN (ggpht.com / lh*.googleapis.com)
 * 2. Embedded map images
 * 3. Street View canvas detection (triggers screenshot suggestion)
 */

import type { MediaCandidate } from '../types'
import { dedupeCandidates, makeMediaCandidate, toAbsoluteUrl } from '../media-candidate-core'

/** Known Google image/POI CDNs */
const GOOGLE_IMAGE_HOSTS = [
  'ggpht.com',
  'lh3.googleusercontent.com',
  'lh4.googleusercontent.com',
  'lh5.googleusercontent.com',
  'lh6.googleusercontent.com',
  'googleapis.com/maps',
  'maps.googleapis.com'
]

function isGoogleImageHost(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase()
    return GOOGLE_IMAGE_HOSTS.some((host) => h.includes(host))
  } catch {
    return false
  }
}

/**
 * Extract POI photos and embedded images from Google Maps pages.
 * These appear in place cards, reviews, and photo galleries.
 */
function fromPoiImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  // POI images are typically loaded as <img> elements or background images
  const selectors = [
    'img[src*="ggpht"]',
    'img[src*="googleusercontent"]',
    'img[src*="googleapis.com/maps"]',
    'button[aria-label*="Photo"] img',
    '.section-photo img',
    '.photo img'
  ]

  for (const sel of selectors) {
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(sel))) {
      if (!(img instanceof HTMLImageElement)) continue
      const src = img.currentSrc || img.src || ''
      if (!src || !isGoogleImageHost(src)) continue
      const abs = toAbsoluteUrl(src, pageUrl)
      if (!abs) continue
      const cand = makeMediaCandidate({
        url: abs,
        pageUrl,
        pageTitle,
        referer: pageUrl,
        confidence: 0.75,
        site: 'googlemaps'
      })
      if (cand) out.push(cand)
    }
  }

  return out
}

/** Extract background-image URLs that point to Google CDN. */
function fromBackgroundImages(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []

  for (const el of Array.from(document.querySelectorAll<HTMLImageElement>('*'))) {
    if (!(el instanceof HTMLElement)) continue
    let bg = ''
    try {
      bg = getComputedStyle(el).backgroundImage
    } catch {
      continue
    }
    if (!bg || bg === 'none') continue
    const m = bg.match(/url\(["']?([^"')]+)["']?\)/)
    if (!m?.[1]) continue
    const url = m[1]
    if (!isGoogleImageHost(url)) continue
    const abs = toAbsoluteUrl(url, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.62,
      site: 'googlemaps'
    })
    if (cand) out.push(cand)
  }

  return out
}

/**
 * Detect Street View / panorama canvas elements.
 * Returns a low-confidence placeholder candidate to signal the caller
 * that a screenshot should be used for this content.
 */
function fromCanvasPanorama(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []

  for (const c of Array.from(document.querySelectorAll<HTMLImageElement>('canvas'))) {
    if (!(c instanceof HTMLCanvasElement)) continue
    const w = c.width
    const h = c.height
    // Skip very small canvases (likely icons/thumbnails)
    if (w < 200 || h < 200) continue
    // Check if this is likely the main map/streetview canvas by size
    const area = w * h
    if (area < 100_000) continue

    // Generate a data URL snapshot of the canvas (if not tainted)
    let dataUrl: string
    try {
      dataUrl = c.toDataURL('image/png')
    } catch {
      // Cross-origin tainted canvas — cannot export
      // Return a marker candidate so UI can suggest screenshot
      const cand = makeMediaCandidate({
        url: `canvas:${w}x${h}:streetview`,
        pageUrl,
        pageTitle,
        confidence: 0.3,
        site: 'googlemaps'
      })
      if (cand) out.push(cand)
      continue
    }

    const cand = makeMediaCandidate({
      url: dataUrl,
      pageUrl,
      pageTitle,
      confidence: 0.65,
      site: 'googlemaps'
    })
    if (cand) out.push(cand)
  }

  return out
}

/** Check meta tags for any image references */
function fromMetaTags(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  const selectors = [
    'meta[property="og:image"]',
    'meta[name="twitter:image"]'
  ]
  for (const sel of selectors) {
    const el = document.querySelector(sel)
    const content = el?.getAttribute('content') || ''
    if (!content || !isGoogleImageHost(content)) continue
    const abs = toAbsoluteUrl(content, pageUrl)
    if (!abs) continue
    const cand = makeMediaCandidate({
      url: abs,
      pageUrl,
      pageTitle,
      referer: pageUrl,
      confidence: 0.78,
      site: 'googlemaps'
    })
    if (cand) out.push(cand)
  }
  return out
}

export function resolveGoogleMapsCandidates(
  pageUrl: string,
  pageTitle: string
): MediaCandidate[] {
  const host = location.hostname.toLowerCase()
  if (
    !host.includes('google.com/maps') &&
    !host.includes('maps.google.com') &&
    !host.includes('google.co.jp/maps') &&
    !host.endsWith('.maps.google.com')
  ) {
    return []
  }

  return dedupeCandidates([
    ...fromMetaTags(pageUrl, pageTitle),
    ...fromPoiImages(pageUrl, pageTitle),
    ...fromBackgroundImages(pageUrl, pageTitle),
    ...fromCanvasPanorama(pageUrl, pageTitle)
  ])
}
