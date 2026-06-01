/**
 * Standalone X/Twitter image scanner — NO imports (safe for chrome.scripting.executeScript files:[]).
 * Sets globalThis.__assetVaultXScan for a follow-up func call.
 */
;(function () {
  const g = globalThis as typeof globalThis & {
    __assetVaultXScan?: () => Promise<{
      mediaKeys: string[]
      rawUrls: string[]
      pageUrl: string
      pageTitle: string
    }>
  }

  function normalizeText(text: string): string {
    return text.replace(/\\u002F/gi, '/').replace(/\\\//g, '/').replace(/\\"/g, '"')
  }

  function mediaKeyFromUrl(url: string): string | null {
    const m = url.match(/pbs\.twimg\.com\/media\/([A-Za-z0-9_-]+)/i)
    return m ? m[1].replace(/\.(jpe?g|png|webp|gif)$/i, '') : null
  }

  function isExcluded(fragment: string): boolean {
    return /profile_images|profile_banners|\/emoji\//i.test(fragment)
  }

  function collectKeysFromText(text: string, keys: Set<string>): void {
    if (!text || !/twimg\.com/i.test(text)) return
    const n = normalizeText(text)
    const patterns = [
      /pbs\.twimg\.com\/media\/([A-Za-z0-9_-]+)/gi,
      /pbs\.twimg\.com%2Fmedia%2F([A-Za-z0-9_-]+)/gi,
      /"media_url_https"\s*:\s*"https?:[^"]*\/media\/([A-Za-z0-9_-]+)/gi
    ]
    for (const re of patterns) {
      for (const m of n.matchAll(re)) {
        if (isExcluded(m[0])) continue
        const key = m[1].replace(/\.(jpe?g|png|webp|gif)$/i, '')
        if (key.length >= 5) keys.add(key)
      }
    }
  }

  function trackMediaUrl(url: string, keys: Set<string>, rawUrls: Set<string>): void {
    if (!url || !/pbs\.twimg\.com\/media\//i.test(url)) return
    const k = mediaKeyFromUrl(url)
    if (!k) return
    keys.add(k)
    rawUrls.add(url)
  }

  function scanDom(keys: Set<string>, rawUrls: Set<string>): void {
    const regions: Element[] = []
    const primary = document.querySelector('[data-testid="primaryColumn"]')
    if (primary) {
      for (const a of Array.from(primary.querySelectorAll('article')).slice(0, 5)) {
        regions.push(a)
      }
    }
    const quote = document.querySelector('[data-testid="card.wrapper"]')
    if (quote) regions.push(quote)
    const tweet = document.querySelector('article[data-testid="tweet"]')
    if (tweet && !regions.includes(tweet)) regions.unshift(tweet)

    for (const root of regions) {
      collectKeysFromText(root.innerHTML, keys)
      root.querySelectorAll('img[src*="twimg.com"]').forEach((img) => {
        if (img instanceof HTMLImageElement) {
          const src = img.currentSrc || img.src || ''
          collectKeysFromText(src, keys)
          trackMediaUrl(src, keys, rawUrls)
          const ss = img.getAttribute('srcset')
          if (ss) {
            collectKeysFromText(ss, keys)
            for (const part of ss.split(',')) {
              const u = part.trim().split(/\s+/)[0]
              if (u) trackMediaUrl(u, keys, rawUrls)
            }
          }
        }
      })
    }

    try {
      collectKeysFromText(document.documentElement.innerHTML, keys)
    } catch {
      /* ignore */
    }

    for (const script of Array.from(document.querySelectorAll('script'))) {
      collectKeysFromText(script.textContent || '', keys)
    }

    try {
      for (const e of performance.getEntriesByType('resource')) {
        const name = (e as PerformanceResourceTiming).name
        if (name) trackMediaUrl(name, keys, rawUrls)
      }
    } catch {
      /* ignore */
    }
  }

  function syndicationToken(statusId: string): string {
    return ((Number(statusId) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '')
  }

  function absorbSyndicationJson(data: unknown, keys: Set<string>, rawUrls: Set<string>): void {
    const walk = (node: unknown): void => {
      if (!node) return
      if (typeof node === 'string') {
        collectKeysFromText(node, keys)
        const re = /https?:\/\/pbs\.twimg\.com\/media\/[A-Za-z0-9_-]+[^"'\\\s]*/gi
        for (const hit of normalizeText(node).match(re) || []) {
          trackMediaUrl(hit, keys, rawUrls)
        }
        return
      }
      if (Array.isArray(node)) {
        for (const x of node) walk(x)
        return
      }
      if (typeof node === 'object') {
        for (const v of Object.values(node as Record<string, unknown>)) walk(v)
      }
    }
    walk(data)
  }

  async function fetchFromSyndication(
    statusId: string,
    keys: Set<string>,
    rawUrls: Set<string>
  ): Promise<void> {
    const token = syndicationToken(statusId)
    const resp = await fetch(
      `https://cdn.syndication.twimg.com/tweet-result?id=${statusId}&token=${token}`,
      { credentials: 'omit', cache: 'no-store' }
    )
    if (!resp.ok) return
    const data = await resp.json()
    absorbSyndicationJson(data, keys, rawUrls)
  }

  g.__assetVaultXScan = async function scanXImagesOnPage() {
    const pageUrl = location.href
    const pageTitle = document.title || location.hostname
    const keys = new Set<string>()
    const rawUrls = new Set<string>()
    const statusId = pageUrl.match(/\/status\/(\d+)/i)?.[1] ?? null

    if (statusId) {
      try {
        await fetchFromSyndication(statusId, keys, rawUrls)
      } catch {
        /* fall through */
      }
    }

    scanDom(keys, rawUrls)
    return {
      mediaKeys: [...keys],
      rawUrls: [...rawUrls],
      pageUrl,
      pageTitle
    }
  }
})()
