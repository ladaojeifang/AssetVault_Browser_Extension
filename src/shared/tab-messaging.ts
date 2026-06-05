import type { CollectMeta, MediaCandidate, PageMediaItem } from './types'
import { isInjectableTabUrl } from './collect-meta-core'
import { ensureHostPermissionForUrl, HOST_PERMISSION_DENIED_MSG } from './host-permissions'
import { expandGenericBatchVariants } from './batch-image-variants'
import { discoverXMediaForTab, hdPayloadFromXUrls, isXPageUrl } from './x-tab-scan'

export function injectableTabMessage(url: string | undefined): string | null {
  if (!url) return '无法获取当前标签页地址'
  if (!isInjectableTabUrl(url)) {
    return '当前页面不支持采集（仅 http/https 普通网页）。请打开目标网站后刷新页面再试。'
  }
  return null
}

/** Stable page key for SPA rescan matching (ignores hash and query). */
export function pageMatchKey(url: string): string | null {
  try {
    const u = new URL(url)
    return `${u.origin}${u.pathname}`
  } catch {
    return null
  }
}

export function urlsMatchForRescan(savedUrl: string, tabUrl: string): boolean {
  if (savedUrl === tabUrl) return true
  const savedKey = pageMatchKey(savedUrl)
  const tabKey = pageMatchKey(tabUrl)
  if (!savedKey || !tabKey) return false
  if (savedKey === tabKey) return true
  return tabKey.startsWith(savedKey) || savedKey.startsWith(tabKey)
}

function mapScanItems(items: PageMediaItem[]): CollectMeta[] {
  return items.map((i) => ({
    url: i.url,
    filename: i.filename,
    pageUrl: i.pageUrl,
    pageTitle: i.pageTitle,
    width: i.width,
    height: i.height
  }))
}

function toPageMediaItems(list: CollectMeta[]): PageMediaItem[] {
  return list.map((m, i) => ({
    ...m,
    id: `item-${i}-${m.variant ?? 'img'}`,
    kind: 'image' as const,
    selected: true
  }))
}

async function pingContentScript(tabId: number): Promise<boolean> {
  try {
    const resp = await chrome.tabs.sendMessage(tabId, { type: 'CONTENT_PING' })
    return resp?.ok === true
  } catch {
    return false
  }
}

async function readScanFromTab(tabId: number): Promise<CollectMeta[] | null> {
  try {
    const resp = await chrome.tabs.sendMessage(tabId, { type: 'SCAN_PAGE_MEDIA' })
    if (resp?.ok && Array.isArray(resp.items)) {
      return mapScanItems(resp.items as PageMediaItem[])
    }
    if (resp?.ok === false) {
      console.warn('[AssetVault] SCAN_PAGE_MEDIA:', (resp as { error?: string }).error)
      return []
    }
  } catch {
    /* no receiver or scan failed */
  }
  return null
}

async function ensureContentScript(tabId: number): Promise<void> {
  if (await pingContentScript(tabId)) return
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js']
  })
  await new Promise((r) => setTimeout(r, 150))
}

/** Inject content.js if the tab has no receiver yet (e.g. page video context). */
export async function ensureContentScriptForTab(tabId: number): Promise<void> {
  return ensureContentScript(tabId)
}

async function runPageHook<T>(
  tabId: number,
  hookName: '__assetVaultResolveHd' | '__assetVaultScanBatch'
): Promise<T | null> {
  await ensureContentScript(tabId)
  const injected = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (name: '__assetVaultResolveHd' | '__assetVaultScanBatch') => {
      const fn = (globalThis as unknown as Record<string, () => Promise<unknown> | unknown>)[name]
      if (typeof fn !== 'function') return null
      try {
        return await fn()
      } catch (e) {
        return { __error: e instanceof Error ? e.message : String(e) }
      }
    },
    args: [hookName]
  })
  const result = injected[0]?.result
  if (result && typeof result === 'object' && '__error' in result) {
    throw new Error(String((result as { __error: string }).__error))
  }
  return (result ?? null) as T | null
}

async function scanCollectMetaInTab(tabId: number): Promise<CollectMeta[]> {
  const tab = await chrome.tabs.get(tabId)
  if (!tab.url) return []

  if (isXPageUrl(tab.url)) {
    const xList = await discoverXMediaForTab(tabId, tab.url, tab.title ?? '')
    if (xList.length) return xList
  }

  let list = await readScanFromTab(tabId)
  if (list === null || !list.length) {
    await ensureContentScript(tabId)
    list = await readScanFromTab(tabId)
  }
  if (!list?.length) {
    try {
      const batch = await runPageHook<PageMediaItem[]>(tabId, '__assetVaultScanBatch')
      if (batch?.length) list = mapScanItems(batch)
    } catch {
      /* hook failed */
    }
  }

  if (!list?.length) return []

  const expanded = await expandGenericBatchVariants(list, tab.url)
  return expanded.length ? expanded : list
}

export async function scanPageMediaInTab(
  tabId: number,
  _options?: { rescan?: boolean }
): Promise<PageMediaItem[]> {
  const tab = await chrome.tabs.get(tabId)
  if (!tab.url) return []

  const granted = await ensureHostPermissionForUrl(tab.url)
  if (!granted) throw new Error(HOST_PERMISSION_DENIED_MSG)

  const list = await scanCollectMetaInTab(tabId)
  return toPageMediaItems(list)
}

function mapCandidates(items: MediaCandidate[]): MediaCandidate[] {
  return items.map((x) => ({ ...x }))
}

export async function resolveVideoCandidatesInTab(tabId: number): Promise<MediaCandidate[]> {
  const tab = await chrome.tabs.get(tabId)
  if (!tab.url) return []

  const granted = await ensureHostPermissionForUrl(tab.url)
  if (!granted) throw new Error(HOST_PERMISSION_DENIED_MSG)

  try {
    const resp = await chrome.tabs.sendMessage(tabId, { type: 'RESOLVE_VIDEO_CANDIDATES' })
    if (resp?.ok && Array.isArray(resp.candidates)) {
      return mapCandidates(resp.candidates as MediaCandidate[])
    }
  } catch {
    /* content may not be loaded */
  }

  if (!(await pingContentScript(tabId))) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    })
  }

  try {
    const resp = await chrome.tabs.sendMessage(tabId, { type: 'SCAN_PAGE_MEDIA_DEEP' })
    if (resp?.ok && Array.isArray(resp.candidates)) {
      return mapCandidates(resp.candidates as MediaCandidate[])
    }
  } catch {
    /* no receiver after injection, continue to script fallback */
  }
  // Fallback: no content listener even after injection. Run a self-contained page scan.
  const injected = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const pageUrl = location.href
      const pageTitle = document.title || location.hostname
      const out: Array<{
        kind: 'video' | 'gif'
        sourceType: 'direct_file' | 'hls_manifest'
        url: string
        filename?: string
        mime?: string
        duration?: number
        referer?: string
        pageUrl: string
        pageTitle: string
        site: 'generic' | 'youtube' | 'twitter' | 'bilibili'
        confidence: number
      }> = []
      const seen = new Set<string>()
      const toAbs = (raw: string) => {
        try {
          return new URL(raw, pageUrl).href
        } catch {
          return null
        }
      }
      const filenameFromUrl = (u: string) => {
        try {
          const p = new URL(u).pathname.split('/').pop()
          return p && p.includes('.') ? decodeURIComponent(p) : undefined
        } catch {
          return undefined
        }
      }
      const pickSourceType = (u: string, mime?: string): 'direct_file' | 'hls_manifest' | null => {
        const m = (mime || '').toLowerCase()
        let p: URL | null = null
        try {
          p = new URL(u)
        } catch {
          p = null
        }
        const qMime = (p?.searchParams.get('mime') || '').toLowerCase()
        const host = (p?.hostname || '').toLowerCase()
        const path = (p?.pathname || '').toLowerCase()
        const query = (p?.search || '').toLowerCase()
        if (
          /\.m3u8(\?|#|$)/i.test(u) ||
          m.includes('application/vnd.apple.mpegurl') ||
          qMime.includes('mpegurl') ||
          query.includes('.m3u8')
        ) {
          return 'hls_manifest'
        }
        if (
          /\.(mp4|webm|m4v|mov|mkv|gif|gifv)(\?|#|$)/i.test(u) ||
          m.startsWith('video/') ||
          m === 'image/gif' ||
          qMime.startsWith('video/') ||
          qMime === 'image/gif'
        ) {
          return 'direct_file'
        }
        if (host.endsWith('googlevideo.com') && path.includes('videoplayback')) return 'direct_file'
        if (host.endsWith('video.twimg.com')) {
          if (path.includes('.m3u8') || query.includes('m3u8')) return 'hls_manifest'
          if (path.includes('/ext_tw_video/') || path.includes('/amplify_video/')) return 'direct_file'
        }
        if (host.includes('bilivideo.com')) return 'direct_file'
        return null
      }
      const site: 'generic' | 'youtube' | 'twitter' | 'bilibili' = /youtube\.com|youtu\.be/i.test(
        location.hostname
      )
        ? 'youtube'
        : /x\.com|twitter\.com/i.test(location.hostname)
          ? 'twitter'
          : /bilibili\.com/i.test(location.hostname)
            ? 'bilibili'
            : 'generic'
      const push = (url: string, mime?: string, duration?: number, confidence = 0.65) => {
        if (!/^https?:\/\//.test(url) || seen.has(url)) return
        const sourceType = pickSourceType(url, mime)
        if (!sourceType) return
        seen.add(url)
        out.push({
          kind: /\.gif(\?|#|$)/i.test(url) || (mime || '').toLowerCase() === 'image/gif' ? 'gif' : 'video',
          sourceType,
          url,
          filename: filenameFromUrl(url),
          mime,
          duration,
          referer: pageUrl,
          pageUrl,
          pageTitle,
          site,
          confidence
        })
      }

      for (const v of Array.from(document.querySelectorAll('video'))) {
        const vd = v as HTMLVideoElement
        const d = Number.isFinite(vd.duration) ? vd.duration : undefined
        for (const raw of [vd.currentSrc, vd.src]) {
          const abs = raw ? toAbs(raw) : null
          if (abs) push(abs, undefined, d, 0.82)
        }
        for (const s of Array.from(v.querySelectorAll('source'))) {
          const raw = s.getAttribute('src') || ''
          const abs = raw ? toAbs(raw) : null
          if (abs) push(abs, s.getAttribute('type') || undefined, d, 0.78)
        }
      }

      for (const a of Array.from(document.querySelectorAll('a[href]'))) {
        const abs = toAbs(a.getAttribute('href') || '')
        if (abs) push(abs, undefined, undefined, 0.56)
      }

      const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
      for (const r of entries) {
        if (r.name) push(r.name, undefined, undefined, /\.m3u8(\?|#|$)/i.test(r.name) ? 0.72 : 0.5)
      }

      const scriptRe =
        /https?:\/\/[^\s"'\\]+?(?:\.m3u8(?:\?[^\s"'\\]*)?|\.mp4(?:\?[^\s"'\\]*)?|\/videoplayback\?[^\s"'\\]+|\/ext_tw_video\/[^\s"'\\]+|\/amplify_video\/[^\s"'\\]+|bilivideo\.com[^\s"'\\]+)/gi
      for (const s of Array.from(document.querySelectorAll('script'))) {
        const txt = s.textContent || ''
        if (!txt) continue
        const hits = txt.match(scriptRe) || []
        for (const h of hits) {
          push(h, undefined, undefined, /\.m3u8/i.test(h) ? 0.8 : 0.72)
        }
      }

      return out.sort((a, b) => b.confidence - a.confidence)
    }
  })
  const first = injected[0]?.result
  return Array.isArray(first) ? mapCandidates(first as MediaCandidate[]) : []
}

async function tryResolveHdViaMessage(tabId: number): Promise<import('./messages').HdImageResolvePayload | null> {
  try {
    const resp = await chrome.tabs.sendMessage(tabId, { type: 'RESOLVE_HD_IMAGE' })
    if (resp?.ok && resp.hd?.candidates?.length) {
      return resp.hd as import('./messages').HdImageResolvePayload
    }
  } catch {
    /* no receiver */
  }
  return null
}

export async function resolveHdImageInTab(
  tabId: number
): Promise<import('./messages').HdImageResolvePayload> {
  const tab = await chrome.tabs.get(tabId)
  if (!tab.url) throw new Error('无法获取当前标签页地址')

  const granted = await ensureHostPermissionForUrl(tab.url)
  if (!granted) throw new Error(HOST_PERMISSION_DENIED_MSG)

  if (isXPageUrl(tab.url)) {
    const xList = await discoverXMediaForTab(tabId, tab.url, tab.title ?? '')
    const hdUrls = xList.filter((m) => m.variant === 'hd').map((m) => m.url)
    if (hdUrls.length) {
      const payload = hdPayloadFromXUrls(hdUrls, tab.url, tab.title ?? '')
      if (payload.candidates.length) return payload
    }
  }

  let hd = await tryResolveHdViaMessage(tabId)
  if (hd) return hd

  await ensureContentScript(tabId)
  hd = await tryResolveHdViaMessage(tabId)
  if (hd) return hd

  try {
    const fromHook = await runPageHook<import('./messages').HdImageResolvePayload>(
      tabId,
      '__assetVaultResolveHd'
    )
    if (fromHook?.candidates?.length) return fromHook
  } catch {
    /* hook failed */
  }

  throw new Error('当前页未找到可下载的高清图片。请刷新页面后重试。')
}

export async function requestSaveMetaFromTab(
  tabId: number,
  payload: { srcUrl?: string; linkUrl?: string; pageUrl?: string }
): Promise<CollectMeta | null> {
  try {
    const resp = await chrome.tabs.sendMessage(tabId, {
      type: 'SAVE_TARGET',
      ...payload
    })
    if (resp?.ok && resp.meta) return resp.meta as CollectMeta
  } catch {
    /* no receiver */
  }
  return null
}

/** Find an open tab for batch rescan when the original tab id is stale. */
export async function findTabForBatchRescan(args: {
  tabId?: number
  pageUrl?: string
}): Promise<chrome.tabs.Tab | null> {
  if (args.tabId) {
    try {
      const tab = await chrome.tabs.get(args.tabId)
      if (tab.id && tab.url && isInjectableTabUrl(tab.url)) {
        if (!args.pageUrl || urlsMatchForRescan(args.pageUrl, tab.url)) return tab
      }
    } catch {
      /* tab closed */
    }
  }

  if (!args.pageUrl) return null
  const tabs = await chrome.tabs.query({})
  const savedKey = pageMatchKey(args.pageUrl)

  const exact = tabs.find((t) => t.url && urlsMatchForRescan(args.pageUrl!, t.url))
  if (exact?.id) return exact

  if (savedKey) {
    return (
      tabs.find((t) => {
        if (!t.url) return false
        const key = pageMatchKey(t.url)
        return key === savedKey
      }) ?? null
    )
  }

  return null
}

/** Inject screenshot UI via bundled file (single source: injected-shot-ui.js). */
export async function injectShotUI(tabId: number, mode: 'region' | 'element'): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['injected-shot-ui.js']
  })
  const started = await chrome.scripting.executeScript({
    target: { tabId },
    func: (shotMode: 'region' | 'element') => {
      const start = (
        globalThis as typeof globalThis & {
          __assetvaultStartShot?: (m: 'region' | 'element') => void
        }
      ).__assetvaultStartShot
      if (typeof start !== 'function') return false
      start(shotMode)
      return true
    },
    args: [mode]
  })
  if (!started[0]?.result) {
    throw new Error('截图界面加载失败，请刷新页面后重试')
  }
}

/** Remove region/element screenshot overlay if present. */
export async function dismissShotUI(tabId: number): Promise<void> {
  await chrome.scripting
    .executeScript({
      target: { tabId },
      func: () => {
        document.getElementById('assetvault-shot-overlay')?.remove()
        document.body.style.userSelect = ''
      }
    })
    .catch(() => null)
}
