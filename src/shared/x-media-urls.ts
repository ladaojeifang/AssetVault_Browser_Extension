/** Shared X/Twitter media URL discovery (DOM + network + inline JSON). */

export function isXPageHost(host: string): boolean {
  return host.includes('twitter.com') || host === 'x.com' || host.endsWith('.x.com')
}

export function statusIdFromPageUrl(pageUrl: string): string | null {
  const m = pageUrl.match(/\/status\/(\d+)/i)
  return m?.[1] ?? null
}

/** Stable key for one tweet photo (ignores ?name=small vs orig). */
export function twitterMediaKey(urlOrId: string): string | null {
  const s = urlOrId.trim()
  if (!s) return null
  if (!s.includes('/') && /^[A-Za-z0-9_-]+$/i.test(s)) {
    return s.replace(/\.(jpe?g|png|webp|gif)$/i, '')
  }
  const m = s.match(/pbs\.twimg\.com\/media\/([A-Za-z0-9_-]+)/i)
  return m ? m[1].replace(/\.(jpe?g|png|webp|gif)$/i, '') : null
}

export function toAbsoluteMediaUrl(raw: string, pageUrl: string): string | null {
  const t = raw.trim().replace(/\\u002F/gi, '/').replace(/\\\//g, '/')
  if (!t) return null
  try {
    return new URL(t, pageUrl).href
  } catch {
    return null
  }
}

function isExcludedMediaPath(fragment: string): boolean {
  return /profile_images|profile_banners|\/emoji\/|card_img/i.test(fragment)
}

function normalizeInlineText(text: string): string {
  return text.replace(/\\u002F/gi, '/').replace(/\\\//g, '/').replace(/\\"/g, '"')
}

function scriptMightHaveTweetMedia(text: string): boolean {
  const n = normalizeInlineText(text)
  return /twimg\.com/i.test(n) && /\/media\//i.test(n)
}

/** Pull unique media keys from arbitrary HTML/JSON text. */
export function collectTwitterMediaKeysFromText(text: string, keys: Set<string>): void {
  if (!text || !scriptMightHaveTweetMedia(text)) return
  const normalized = normalizeInlineText(text)
  const patterns = [
    /pbs\.twimg\.com\/media\/([A-Za-z0-9_-]+)/gi,
    /pbs\.twimg\.com%2Fmedia%2F([A-Za-z0-9_-]+)/gi,
    /"media_url_https"\s*:\s*"https?:[^"]*\/media\/([A-Za-z0-9_-]+)/gi,
    /"media_url"\s*:\s*"https?:[^"]*\/media\/([A-Za-z0-9_-]+)/gi
  ]
  for (const re of patterns) {
    for (const m of normalized.matchAll(re)) {
      const hit = m[0]
      if (isExcludedMediaPath(hit)) continue
      const key = m[1].replace(/\.(jpe?g|png|webp|gif)$/i, '')
      if (key.length >= 5 && !/^(format|name|small|large|orig)$/i.test(key)) keys.add(key)
    }
  }
}

function origUrlForMediaKey(key: string): string {
  return `https://pbs.twimg.com/media/${key}?format=jpg&name=orig`
}

function keysToOrigUrls(keys: Iterable<string>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const key of keys) {
    const url = origUrlForMediaKey(key)
    const dedupe = twitterMediaKey(url)
    if (!dedupe || seen.has(dedupe)) continue
    seen.add(dedupe)
    out.push(url)
  }
  return out
}

function collectFromAllScripts(keys: Set<string>): void {
  for (const script of Array.from(document.querySelectorAll('script'))) {
    collectTwitterMediaKeysFromText(script.textContent || '', keys)
  }
}

function collectFromPageHtml(keys: Set<string>): void {
  try {
    const html = document.documentElement?.innerHTML
    if (html) collectTwitterMediaKeysFromText(html, keys)
  } catch {
    /* ignore */
  }
}

function collectFromDomRegions(keys: Set<string>): void {
  const regions: Element[] = []
  const primary = document.querySelector('[data-testid="primaryColumn"]')
  if (primary) {
    for (const article of Array.from(primary.querySelectorAll('article')).slice(0, 5)) {
      regions.push(article)
    }
  }
  const quote = document.querySelector('[data-testid="card.wrapper"]')
  if (quote) regions.push(quote)

  const mainTweet = document.querySelector('article[data-testid="tweet"]')
  if (mainTweet && !regions.includes(mainTweet)) regions.unshift(mainTweet)

  for (const root of regions) {
    collectTwitterMediaKeysFromText(root.innerHTML, keys)
    root
      .querySelectorAll(
        '[data-testid="tweetPhoto"] img, [data-testid="tweet"] img, img[src*="twimg.com"]'
      )
      .forEach((img) => {
        if (img instanceof HTMLImageElement) {
          collectTwitterMediaKeysFromText(img.currentSrc || img.src || '', keys)
          const srcset = img.getAttribute('srcset')
          if (srcset) collectTwitterMediaKeysFromText(srcset, keys)
        }
      })
  }
}

function collectFromNetworkAndMeta(
  pageUrl: string,
  keys: Set<string>,
  pushUrl: (raw: string | null | undefined) => void
): void {
  try {
    for (const e of performance.getEntriesByType('resource')) {
      const name = (e as PerformanceResourceTiming).name
      if (name && /pbs\.twimg\.com\/media\//i.test(name)) {
        pushUrl(name)
        const k = twitterMediaKey(name)
        if (k) keys.add(k)
      }
    }
  } catch {
    /* ignore */
  }

  for (const sel of [
    'meta[property="og:image"]',
    'meta[property="og:image:url"]',
    'meta[name="twitter:image"]'
  ]) {
    pushUrl(document.querySelector(sel)?.getAttribute('content'))
  }
}

function walkAllImages(pushUrl: (raw: string | null | undefined) => void): void {
  const walk = (root: Document | ShadowRoot | Element) => {
    root.querySelectorAll('img').forEach((img) => {
      if (!(img instanceof HTMLImageElement)) return
      pushUrl(img.currentSrc || img.src)
      const srcset = img.getAttribute('srcset')
      if (srcset) {
        for (const part of srcset.split(',')) {
          pushUrl(part.trim().split(/\s+/)[0])
        }
      }
    })
    root.querySelectorAll('*').forEach((el) => {
      if (el.shadowRoot) walk(el.shadowRoot)
    })
  }
  walk(document)
}

/** Collect all tweet media URLs on an X page (multi-photo carousels + quoted tweets). */
export function discoverTwitterMediaUrls(pageUrl: string): string[] {
  const host = typeof location !== 'undefined' ? location.hostname.toLowerCase() : ''
  if (!isXPageHost(host)) return []

  try {
    const keys = new Set<string>()

    const pushUrl = (raw: string | null | undefined) => {
      const abs = raw ? toAbsoluteMediaUrl(raw, pageUrl) : null
      if (!abs || isExcludedMediaPath(abs) || !/\/media\//i.test(abs)) return
      const k = twitterMediaKey(abs)
      if (k) keys.add(k)
    }

    // Prefer status-scoped scripts when on a tweet permalink.
    const statusId = statusIdFromPageUrl(pageUrl)
    if (statusId) {
      for (const script of Array.from(document.querySelectorAll('script'))) {
        const text = script.textContent || ''
        if (!text.includes(statusId)) continue
        collectTwitterMediaKeysFromText(text, keys)
      }
    }

    collectFromDomRegions(keys)
    collectFromAllScripts(keys)
    collectFromPageHtml(keys)
    collectFromNetworkAndMeta(pageUrl, keys, pushUrl)
    walkAllImages(pushUrl)

    return keysToOrigUrls(keys)
  } catch (e) {
    console.warn('[AssetVault] discoverTwitterMediaUrls failed', e)
    return []
  }
}
