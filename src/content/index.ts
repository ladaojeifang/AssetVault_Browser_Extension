import { metaFromMediaUrl } from '../shared/collect-meta-core'
import {
  findCollectableFromEventTarget,
  metaFromImage,
  scanPageMedia
} from '../shared/element-meta'
import { resolveHdImageOnPage } from '../shared/hd-image-resolver'
import { resolveBilibiliCandidates } from '../shared/site-adapters/bilibili'
import { resolveTwitterCandidates } from '../shared/site-adapters/twitter'
import { resolveYoutubeCandidates } from '../shared/site-adapters/youtube'
import { runMatchingAdapters } from '../shared/site-adapters/index'
import { dedupeCandidates } from '../shared/media-candidate-core'
import { scanPageMediaDeepGeneric } from '../shared/stream-detector'
import { resolveVideoPageContext } from '../shared/video-page-url-rules'
import type { ContentMessage, ContentResponse } from '../shared/messages'
import type { CollectMeta, MediaCandidate, PageMediaItem } from '../shared/types'

import { startShotUIInPage } from '../shared/injected-shot-ui'
import { openBoardSaver as bsOpen, closeBoardSaver } from '../board-saver/board-saver-bridge'

const DROP_ZONE_ID = 'assetvault-drop-zone'

let toastHideTimer: ReturnType<typeof setTimeout> | null = null

function showToast(text: string): void {
  let el = document.getElementById('assetvault-toast')
  if (!el) {
    el = document.createElement('div')
    el.id = 'assetvault-toast'
    el.className = 'assetvault-toast'
    document.body.appendChild(el)
  }
  el.classList.remove('has-action')
  el.replaceChildren()
  el.append(text)
  el.classList.add('visible')
  if (toastHideTimer) clearTimeout(toastHideTimer)
  toastHideTimer = window.setTimeout(() => el?.classList.remove('visible'), 3200)
}

function showPageVideoFailureToast(text: string, diagnostics: string): void {
  let el = document.getElementById('assetvault-toast')
  if (!el) {
    el = document.createElement('div')
    el.id = 'assetvault-toast'
    el.className = 'assetvault-toast'
    document.body.appendChild(el)
  }
  el.classList.add('has-action')
  el.replaceChildren()
  const span = document.createElement('span')
  span.textContent = text
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'assetvault-toast-cancel'
  btn.textContent = '复制诊断'
  btn.addEventListener('click', () => {
    void navigator.clipboard.writeText(diagnostics)
    btn.textContent = '已复制'
  })
  el.append(span, btn)
  el.classList.add('visible')
  if (toastHideTimer) clearTimeout(toastHideTimer)
  toastHideTimer = window.setTimeout(() => el?.classList.remove('visible'), 15000)
}

function showPageVideoJobToast(text: string, jobId: string): void {
  let el = document.getElementById('assetvault-toast')
  if (!el) {
    el = document.createElement('div')
    el.id = 'assetvault-toast'
    el.className = 'assetvault-toast'
    document.body.appendChild(el)
  }
  el.classList.add('has-action')
  el.replaceChildren()
  const span = document.createElement('span')
  span.textContent = text
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'assetvault-toast-cancel'
  btn.textContent = '取消'
  btn.addEventListener('click', () => {
    void chrome.runtime.sendMessage({ type: 'IMPORT_PAGE_VIDEO_ABORT', jobId })
    el?.classList.remove('visible')
  })
  el.append(span, btn)
  el.classList.add('visible')
  if (toastHideTimer) clearTimeout(toastHideTimer)
  toastHideTimer = window.setTimeout(() => el?.classList.remove('visible'), 12000)
}

function metaFromContextMenuPayload(data: {
  srcUrl?: string
  linkUrl?: string
  pageUrl?: string
}): CollectMeta | null {
  return metaFromMediaUrl(data.srcUrl || data.linkUrl, data.pageUrl || location.href, document.title)
}

function ensureDropZone(onDrop: (meta: CollectMeta) => void): void {
  if (document.getElementById(DROP_ZONE_ID)) return
  const zone = document.createElement('div')
  zone.id = DROP_ZONE_ID
  zone.className = 'assetvault-drop-zone'
  zone.innerHTML = '<span>拖到此处保存到 AssetVault</span>'

  let dragTimer: number | null = null
  document.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer?.types.includes('Files') && !e.dataTransfer?.types.includes('text/uri-list')) {
      const t = e.target
      if (t instanceof HTMLImageElement || t instanceof Element) {
        zone.classList.add('active')
      }
    }
  })
  document.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget) {
      zone.classList.remove('active')
    }
  })
  document.addEventListener('dragover', (e) => {
    e.preventDefault()
    if (dragTimer) window.clearTimeout(dragTimer)
    dragTimer = window.setTimeout(() => {
      zone.classList.remove('active')
    }, 200)
  })
  document.addEventListener('drop', (e) => {
    if (dragTimer) window.clearTimeout(dragTimer)
    zone.classList.remove('active')
    e.preventDefault()
    const meta =
      findCollectableFromEventTarget(e.target, location.href, document.title) ??
      (() => {
        const img = document.querySelector('img:hover') as HTMLImageElement | null
        return img ? metaFromImage(img, location.href, document.title) : null
      })()
    if (meta) onDrop(meta)
  })

  document.body.appendChild(zone)
}

async function saveMeta(meta: CollectMeta): Promise<void> {
  const resp = await chrome.runtime.sendMessage({ type: 'IMPORT_META', meta })
  if (!resp?.ok) throw new Error(resp?.error ?? '保存失败')
  if (resp.skipped) {
    showToast('已跳过（重复）')
  } else {
    showToast('已保存到 AssetVault')
  }
}

async function scanForBatch(): Promise<PageMediaItem[]> {
  // Return cached results if available and observer hasn't invalidated them
  if (cachedMediaItems) return cachedMediaItems

  const list = await scanPageMedia(location.href, document.title)
  const items = list.map((m, i) => ({
    ...m,
    id: `item-${i}`,
    kind: 'image' as const,
    selected: true
  }))
  cachedMediaItems = items
  // Start observing DOM changes for future cache invalidation
  startPageObserver()
  return items
}

function resolveVideoCandidatesOnPage(): MediaCandidate[] {
  const pageUrl = location.href
  const pageTitle = document.title
  return dedupeCandidates([
    ...scanPageMediaDeepGeneric(pageUrl, pageTitle),
    ...resolveYoutubeCandidates(pageUrl, pageTitle),
    ...resolveTwitterCandidates(pageUrl, pageTitle),
    ...resolveBilibiliCandidates(pageUrl, pageTitle),
    // ★ New: run all registered site adapters for video/media candidates
    ...runMatchingAdapters(pageUrl, pageTitle),
    // ★ New: collect from same-origin iframes
    ...collectIframeCandidates(pageUrl, pageTitle)
  ])
}


// ── MutationObserver for dynamic page content ───────────────────────────
let pageObserver: MutationObserver | null = null
const OBSERVER_DEBOUNCE_MS = 800
let observerDebounceTimer: ReturnType<typeof setTimeout> | null = null
/** Cached latest scan results — updated when DOM changes are detected. */
let cachedMediaItems: PageMediaItem[] | null = null

/**
 * Start a MutationObserver that watches the document body for changes.
 * When mutations are detected (e.g., lazy-loaded images, infinite scroll),
 * the media cache is invalidated so the next batch scan will re-scan.
 * Does NOT auto-re-scan to avoid performance impact; only invalidates cache.
 */
function startPageObserver(): void {
  if (pageObserver) return // already running
  pageObserver = new MutationObserver(() => {
    if (observerDebounceTimer) clearTimeout(observerDebounceTimer)
    observerDebounceTimer = setTimeout(() => {
      cachedMediaItems = null // invalidate cache → next scan will re-run
    }, OBSERVER_DEBOUNCE_MS)
  })
  try {
    pageObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false
    })
  } catch {
    /* body may not exist yet in some edge cases */
  }
}

// ── Iframe scanning support ──────────────────────────────────────────────

/**
 * Attempt to collect media from same-origin iframes on the page.
 * Returns empty array for cross-origin iframes (security restriction).
 * This is called as part of deep scan / video candidate resolution.
 */
function collectIframeCandidates(pageUrl: string, pageTitle: string): MediaCandidate[] {
  const out: MediaCandidate[] = []
  try {
    const iframes = Array.from(document.querySelectorAll('iframe'))
    for (const iframe of iframes) {
      try {
        const doc = iframe.contentDocument
        if (!doc) continue // cross-origin or not loaded

        // Scan images inside iframe
        for (const img of Array.from(doc.querySelectorAll('img'))) {
          const src = img.src || img.getAttribute('src') || ''
          if (!src || !/^https?:\/\//.test(src)) continue
          const cand = (() => {
            try {
              return new URL(src, pageUrl).href
            } catch { return null }
          })()
          if (!cand) continue
          // Use a lower confidence for iframe content since it's often decorative
          out.push({
            kind: 'video' as const,
            sourceType: 'direct_file' as const,
            url: cand,
            filename: undefined,
            mime: undefined,
            duration: undefined,
            referer: pageUrl,
            pageUrl,
            pageTitle: `${pageTitle} [iframe]`,
            site: 'generic' as const,
            confidence: 0.45
          })
        }

        // Scan videos inside iframe
        for (const video of Array.from(doc.querySelectorAll('video'))) {
          for (const raw of [video.currentSrc, video.src]) {
            if (!raw) continue
            const abs = (() => { try { return new URL(raw, pageUrl).href } catch { return null } })()
            if (!abs) continue
            out.push({
              kind: 'video' as const,
              sourceType: 'direct_file' as const,
              url: abs,
              filename: undefined,
              mime: video.getAttribute('type') || undefined,
              duration: Number.isFinite(video.duration) ? video.duration : undefined,
              referer: pageUrl,
              pageUrl,
              pageTitle: `${pageTitle} [iframe]`,
              site: 'generic' as const,
              confidence: 0.6
            })
          }
        }
      } catch {
        /* cross-origin iframe — skip silently */
      }
    }
  } catch { /* querySelectorAll failed */ }
  return out
}

function openBoardSaver(): void {
  bsOpen()
}

const CONTENT_INIT_KEY = '__assetvaultContentInit'

type ContentPageHooks = typeof globalThis & {
  __assetVaultResolveHd?: () => Promise<import('../shared/hd-image-resolver').HdImageResolveResult>
  __assetVaultScanBatch?: () => Promise<PageMediaItem[]>
}

function registerContentScript(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    void (async () => {
      if (message?.type === 'TOAST') {
        showToast(String(message.text))
        sendResponse({ ok: true })
        return
      }
      if (message?.type === 'PAGE_VIDEO_JOB_ACTIVE') {
        const jobId = String(message.jobId ?? '')
        if (jobId) showPageVideoJobToast('视频导入进行中', jobId)
        sendResponse({ ok: true })
        return
      }
      if (message?.type === 'PAGE_VIDEO_JOB_FAILED') {
        showPageVideoFailureToast(
          String(message.text ?? '视频导入失败'),
          String(message.diagnostics ?? '')
        )
        sendResponse({ ok: true })
        return
      }

      const msg = message as ContentMessage
      try {
        if (msg.type === 'CONTENT_PING') {
          sendResponse({ ok: true } satisfies ContentResponse)
          return
        }
        if (msg.type === 'SCAN_PAGE_MEDIA') {
          const items = await scanForBatch()
          sendResponse({ ok: true, items } satisfies ContentResponse)
          return
        }
        if (msg.type === 'SCAN_PAGE_MEDIA_DEEP' || msg.type === 'RESOLVE_VIDEO_CANDIDATES') {
          sendResponse({
            ok: true,
            candidates: resolveVideoCandidatesOnPage()
          } satisfies ContentResponse)
          return
        }
        if (msg.type === 'START_PAGE_OBSERVER') {
          startPageObserver()
          sendResponse({ ok: true } satisfies ContentResponse)
          return
        }
        if (msg.type === 'SCREENSHOT_UI_START') {
          startShotUIInPage(msg.mode)
          sendResponse({ ok: true } satisfies ContentResponse)
          return
        }
        if (msg.type === 'RESOLVE_HD_IMAGE') {
          const hd = await resolveHdImageOnPage()
          sendResponse({ ok: true, hd } satisfies ContentResponse)
          return
        }
        if (msg.type === 'SAVE_TARGET') {
          const payload = message as {
            type: 'SAVE_TARGET'
            target?: EventTarget
            srcUrl?: string
            linkUrl?: string
            pageUrl?: string
          }
          const meta =
            metaFromContextMenuPayload(payload) ??
            findCollectableFromEventTarget(payload.target ?? null, location.href, document.title)
          if (!meta) {
            sendResponse({ ok: false, error: '未找到可保存的图片或视频' } satisfies ContentResponse)
            return
          }
          sendResponse({ ok: true, meta } satisfies ContentResponse)
          return
        }
        if (msg.type === 'OPEN_BOARD_SAVER') {
          openBoardSaver()
          sendResponse({ ok: true } satisfies ContentResponse)
          return
        }
        if (msg.type === 'PAGE_VIDEO_CONTEXT') {
          const context = resolveVideoPageContext(location.href)
          sendResponse({ ok: true, context } satisfies ContentResponse)
          return
        }
        sendResponse({ ok: false, error: 'Unknown message' } satisfies ContentResponse)
      } catch (e) {
        sendResponse({
          ok: false,
          error: e instanceof Error ? e.message : String(e)
        } satisfies ContentResponse)
      }
    })()
    return true
  })

  void chrome.storage.sync.get('assetvaultExtensionPrefs').then((stored) => {
    const prefs = stored.assetvaultExtensionPrefs as { enableDragSaver?: boolean } | undefined
    if (prefs?.enableDragSaver !== false) {
      ensureDropZone((meta) => {
        void saveMeta(meta).catch((e) => showToast(e instanceof Error ? e.message : String(e)))
      })
    }
  })
}

const g = globalThis as ContentPageHooks & { [CONTENT_INIT_KEY]?: boolean }
g.__assetVaultResolveHd = () => resolveHdImageOnPage()
g.__assetVaultScanBatch = () => scanForBatch()
if (!g[CONTENT_INIT_KEY]) {
  g[CONTENT_INIT_KEY] = true
  registerContentScript()
}
