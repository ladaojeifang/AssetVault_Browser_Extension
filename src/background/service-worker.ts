import {
  assignTags,
  importFromUrl,
  importFromUrlBatch,
  pingApp,
  importAsset,
  importFromDataUrl,
  updateAsset
} from '../shared/api'
import { metaFromContextMenuInfo } from '../shared/collect-meta-core'
import { getPreferences } from '../shared/config'
import type { CollectMeta } from '../shared/types'
import { ensureHostPermissionForUrl } from '../shared/host-permissions'
import {
  dismissShotUI,
  findTabForBatchRescan,
  requestSaveMetaFromTab,
  resolveVideoCandidatesInTab,
  scanPageMediaInTab
} from '../shared/tab-messaging'
import type { BgMessage, BgResponse } from '../shared/messages'
import { ConcurrencyQueue } from '../shared/concurrency'
import {
  downloadBlobToRelativeFilename,
  ensureExtensionDownloadFilenameHook
} from '../shared/chrome-download-blob'
import {
  dataUrlFitsDirectImport,
  DATAURL_MAX_DIRECT_JSON_CHARS,
  uniqueTempDownloadFilename,
} from '../shared/data-url-import'
import {
  FULLPAGE_IMPORT_CHUNK_MAX_BYTES,
  planFullpageCapturePositions,
} from '../shared/fullpage-capture'
import { FullpageOutputBuffer } from '../shared/fullpage-output-buffer'
import { supportsFullPageSessionApi, resetFullPageSessionSupportCache } from '../shared/fullpage-session-api'
import {
  importFullPageViaSession,
  mapFullPageFinishWarnings
} from '../shared/fullpage-session-import'
import {
  FULLPAGE_KEEP_STRIP_FILES_AFTER_FINISH,
  fullPageInspectSessionId,
} from '../shared/fullpage-session-paths'
import {
  applyFullpageLastFrameFloatingHides,
  readFullpageScrollMetricsInTab,
  restoreFullpageInTab,
  scrollFullpageToCss,
  setupFullpageInTab,
} from '../shared/fullpage-tab-bridge'

/** Default concurrency for batch download operations. */
const BATCH_DOWNLOAD_CONCURRENCY = 2

/**
 * Execute a batch import with concurrency control and progress reporting.
 * Processes items in parallel batches, reporting progress back to the caller tab.
 */
async function executeBatchImportWithProgress(args: {
  items: Array<{ url: string; filename?: string; headers?: Record<string, string> }>
  tagIds?: string[]
  reportTabId?: number
  sourceUrl?: string
  duplicatePolicy?: 'use_existing' | 'import_copy'
}): Promise<{ ok: true; batch: unknown }> {
  const { items, tagIds, reportTabId, sourceUrl } = args
  const prefs = await getPreferences()
  const duplicatePolicy = args.duplicatePolicy ?? prefs.duplicatePolicy

  // Split data URIs from regular URLs — data URIs use importFromDataUrl
  const regularItems = items.filter(it => !it.url.startsWith('data:'))
  const dataUriItems = items.filter(it => it.url.startsWith('data:'))

  const total = items.length
  let completed = 0
  const queue = new ConcurrencyQueue(BATCH_DOWNLOAD_CONCURRENCY)

  const results: Array<{ imported: string[]; skipped: Array<{ url: string; reason: string; existingAssetId?: string }>; errors: Array<{ url: string; message: string }> }> = []

  // Process regular URLs in chunks
  const chunkSize = BATCH_DOWNLOAD_CONCURRENCY
  for (let i = 0; i < regularItems.length; i += chunkSize) {
    const chunk = regularItems.slice(i, i + chunkSize)
    await queue.add(async () => {
      try {
        const batch = await importFromUrlBatch({
          items: chunk,
          targetFolderId: prefs.defaultFolderId || undefined,
          duplicatePolicy,
        })
        if (tagIds?.length && batch.imported.length) {
          await assignTags(batch.imported, tagIds)
        }
        if (sourceUrl && batch.imported.length) {
          await Promise.allSettled(
            batch.imported.map(id => updateAsset({ id, sourceUrl }))
          )
        }
        results.push(batch)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        results.push({
          imported: [],
          skipped: [],
          errors: chunk.map(it => ({ url: it.url, message: msg })),
        })
      }
      completed += chunk.length
      if (reportTabId && total > 1) {
        try { void notify(reportTabId, `批量导入进度：${Math.min(completed, total)}/${total}`) } catch { /* */ }
      }
    })
  }

  // Process data URIs individually via importFromDataUrl
  for (const item of dataUriItems) {
    await queue.add(async () => {
      try {
        const result = await importDataUrlViaDownload({
          dataUrl: item.url,
          filename: item.filename ?? `import-${Date.now()}.png`,
          targetFolderId: prefs.defaultFolderId || undefined,
          duplicatePolicy,
          apiTimeoutMs: 30_000,
        })
        const batchResult = {
          imported: result.skipped ? [] : ([result.assetId!].filter(Boolean) as string[]),
          skipped: result.skipped ? ([{ url: item.url, reason: 'duplicate' }]) : [],
          errors: [] as Array<{ url: string; message: string }>
        }
        if (tagIds?.length && batchResult.imported.length) {
          await assignTags(batchResult.imported, tagIds)
        }
        if (sourceUrl && batchResult.imported.length) {
          await Promise.allSettled(
            batchResult.imported.map(id => updateAsset({ id, sourceUrl }))
          )
        }
        results.push(batchResult)
        completed++
        if (reportTabId && total > 1) {
          try { void notify(reportTabId, `批量导入进度：${Math.min(completed, total)}/${total}`) } catch { /* */ }
        }
      } catch (e) {
        results.push({ imported: [], skipped: [], errors: [{ url: item.url, message: e instanceof Error ? e.message : String(e) }] })
        completed++
      }
    })
  }

  // Aggregate results
  const aggregated = results.reduce(
    (acc, b) => ({
      imported: [...acc.imported, ...b.imported],
      skipped: [...acc.skipped, ...b.skipped],
      errors: [...acc.errors, ...b.errors]
    }),
    { imported: [] as string[], skipped: [] as Array<{ url: string; reason: string; existingAssetId?: string }>, errors: [] as Array<{ url: string; message: string }> }
  )

  return { ok: true, batch: aggregated }
}

const MENU_ID = 'assetvault-save-image'

/** Per-tab full-page jobs; abort via SCREENSHOT_ABORT (matches tab when known). */
const activeFullpageCaptures = new Map<number, { abort: boolean }>()

function setFullpageCaptureActive(tabId: number): void {
  activeFullpageCaptures.set(tabId, { abort: false })
}

function isFullpageCaptureAborted(tabId: number): boolean {
  return activeFullpageCaptures.get(tabId)?.abort === true
}

function clearFullpageCaptureActive(tabId: number): void {
  activeFullpageCaptures.delete(tabId)
}

function abortAllFullpageCaptures(): void {
  for (const state of activeFullpageCaptures.values()) {
    state.abort = true
  }
}

function broadcastFullpageCaptureDone(tabId: number, ok: boolean, error?: string): void {
  const payload: BgMessage = { type: 'FULLPAGE_CAPTURE_DONE', tabId, ok, error }
  void chrome.runtime.sendMessage(payload).catch(() => null)
}

function isAllowPartialCaptureStop(reason: string): boolean {
  return (
    isCaptureQuotaError({ message: reason } as Error) ||
    reason.includes('截图频率') ||
    reason.includes('quota') ||
    reason.includes('MAX_CAPTURE_VISIBLE_TAB')
  )
}

/** Chrome MV3: ~2 captureVisibleTab calls per second per extension. */
const CAPTURE_MIN_GAP_MS = 650
let lastCaptureVisibleTabAt = 0

// 整页截图：滚动分段 + 重叠；浮层/滚动逻辑见 fullpage-injected + fullpage-tab-bridge。
const FULLPAGE_IMPORT_API_TIMEOUT_MS = 120_000
const FULLPAGE_REMETRICS_EVERY_SEGMENTS = 8

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function isCaptureQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes('MAX_CAPTURE_VISIBLE_TAB') || msg.includes('quota')
}

async function captureVisibleTabThrottled(
  windowId: number,
  options: chrome.tabs.CaptureVisibleTabOptions
): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const now = Date.now()
    const waitMs = Math.max(0, CAPTURE_MIN_GAP_MS - (now - lastCaptureVisibleTabAt))
    if (waitMs > 0) await sleep(waitMs)

    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, options)
      lastCaptureVisibleTabAt = Date.now()
      return dataUrl
    } catch (e) {
      if (isCaptureQuotaError(e)) {
        await sleep(CAPTURE_MIN_GAP_MS)
        continue
      }
      throw e
    }
  }
  throw new Error('截图频率过高，请稍后再试')
}

ensureExtensionDownloadFilenameHook()

chrome.runtime.onInstalled.addListener(() => {
  ensureExtensionDownloadFilenameHook()
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: '保存到 AssetVault Pro',
      contexts: ['image', 'video', 'link']
    })
  })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return

  const pageUrl = info.pageUrl || tab.url
  if (!pageUrl) {
    console.info('[AssetVault] 无法获取页面 URL')
    return
  }

  try {
    let meta =
      metaFromContextMenuInfo(
        { srcUrl: info.srcUrl, linkUrl: info.linkUrl, pageUrl },
        tab.title ?? ''
      ) ?? null

    if (!meta) {
      const granted = await ensureHostPermissionForUrl(pageUrl)
      if (granted) {
        meta = await requestSaveMetaFromTab(tab.id, {
          srcUrl: info.srcUrl,
          linkUrl: info.linkUrl,
          pageUrl
        })
      }
    }

    if (!meta) {
      await notify(tab.id, '无法识别可保存的资源（请对图片右键，或刷新页面后重试）')
      return
    }

    await handleImport(meta)
    await notify(tab.id, '已提交保存')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!msg.includes('Receiving end does not exist')) {
      await notify(tab.id, msg)
    } else {
      console.info('[AssetVault]', msg)
    }
  }
})

chrome.runtime.onMessage.addListener((message: BgMessage, _sender, sendResponse) => {
  void (async () => {
    try {
      const data = await routeMessage(message, _sender)
      sendResponse(data satisfies BgResponse)
    } catch (e) {
      sendResponse({
        ok: false,
        error: e instanceof Error ? e.message : String(e)
      } satisfies BgResponse)
    }
  })()
  return true
})

// ── Keyboard shortcut ──────────────────────────────────────────────

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'batch-collect') return
  void (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_BOARD_SAVER' })
    } catch {
      // Page may not have content script injected — inject it
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js'],
        })
        // Wait for injection, then retry
        await new Promise(r => setTimeout(r, 300))
        await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_BOARD_SAVER' })
      } catch {
        console.warn('[AssetVault] Failed to open board saver via shortcut')
      }
    }
  })()
})

async function routeMessage(message: BgMessage, sender: chrome.runtime.MessageSender): Promise<BgResponse> {
  switch (message.type) {
    case 'PING_API': {
      const app = await pingApp()
      return { ok: true, app }
    }
    case 'IMPORT_META': {
      const result = await handleImport(message.meta, message.tagIds)
      return { ok: true, assetId: result.assetId, skipped: result.skipped }
    }
    case 'IMPORT_BATCH': {
      const tab = sender.tab?.id
        ? sender.tab
        : await getActiveTabOrThrow().catch(() => null)
      const result = await executeBatchImportWithProgress({
        items: message.items,
        tagIds: message.tagIds,
        reportTabId: tab?.id,
        sourceUrl: message.sourceUrl,
        duplicatePolicy: message.duplicatePolicy,
      })
      return result
    }
    case 'SCREENSHOT_CROP_RECT': {
      const fallbackTab = sender.tab?.id ? null : await getActiveTabOrThrow().catch(() => null)
      const tabId = sender.tab?.id ?? fallbackTab?.id
      if (!tabId) return { ok: false, error: 'Missing tabId' }
      const prefs = await getPreferences()
      try {
        await cropAndImportRect({ tabId, message, prefs })
        return { ok: true }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        await notify(tabId, `截图保存失败：${msg}`)
        return { ok: false, error: msg }
      }
    }
    case 'RESOLVE_VIDEO_CANDIDATES': {
      const tab = await getActiveTabOrThrow()
      if (!tab.id) return { ok: false, error: '无法定位当前标签页' }
      const candidates = await resolveVideoCandidatesInTab(tab.id)
      return { ok: true, candidates }
    }
    case 'RESCAN_PAGE_MEDIA': {
      const tab = await findTabForBatchRescan({
        tabId: message.tabId,
        pageUrl: message.pageUrl
      })
      if (!tab?.id || !tab.url) {
        return { ok: false, error: '找不到来源页面。请回到采集页并保持该标签打开，再点「重新扫描」。' }
      }
      const items = await scanPageMediaInTab(tab.id, { rescan: true })
      return {
        ok: true,
        items,
        pageTitle: tab.title ?? '',
        pageUrl: tab.url,
        sourceTabId: tab.id
      }
    }
    case 'IMPORT_MEDIA_CANDIDATE_BATCH': {
      const tab = sender.tab?.id
        ? sender.tab
        : await getActiveTabOrThrow().catch(() => null)
      const result = await executeBatchImportWithProgress({
        items: message.items,
        reportTabId: tab?.id
      })
      return result
    }
    case 'SCREENSHOT_FULLPAGE': {
      const tab = await getActiveTabOrThrow()
      if (!tab.id) return { ok: false, error: '无法定位当前标签页' }
      const prefs = await getPreferences()
      const tabId = tab.id
      void stitchAndImportFullPage({ tab, prefs, format: message.format })
        .then(() => {
          broadcastFullpageCaptureDone(tabId, true)
        })
        .catch(async (e) => {
          const msg = e instanceof Error ? e.message : String(e)
          const userMsg =
            isCaptureQuotaError(e) || msg.includes('截图频率')
              ? '整页截图过快，请稍候再试（Chrome 限制每秒截图次数）'
              : msg
          await notify(tabId, userMsg)
          broadcastFullpageCaptureDone(tabId, false, userMsg)
        })
      return { ok: true, started: true }
    }
    case 'SCREENSHOT_ABORT': {
      const abortTabId = sender.tab?.id
      if (abortTabId != null) {
        const state = activeFullpageCaptures.get(abortTabId)
        if (state) state.abort = true
        else abortAllFullpageCaptures()
      } else {
        abortAllFullpageCaptures()
      }
      const tab = sender.tab?.id
        ? sender.tab
        : await getActiveTabOrThrow().catch(() => null)
      if (tab?.id) {
        await dismissShotUI(tab.id)
      }
      return { ok: true }
    }
    default:
      return { ok: false, error: 'Unknown message' }
  }
}

async function getActiveTabOrThrow(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !tab.windowId) throw new Error('无法定位当前标签页')
  return tab
}

async function handleImport(
  meta: import('../shared/types').CollectMeta,
  tagIds?: string[]
): Promise<{ assetId?: string; skipped?: boolean }> {
  const prefs = await getPreferences()
  const result = await importFromUrl({
    url: meta.url,
    filename: meta.filename,
    targetFolderId: prefs.defaultFolderId || undefined,
    duplicatePolicy: prefs.duplicatePolicy
  })
  if (!result.skipped && result.assetId) {
    if (tagIds?.length) await assignTags([result.assetId], tagIds)
    if (meta.pageUrl) {
      await updateAsset({ id: result.assetId, sourceUrl: meta.pageUrl }).catch(() => {
        /* sourceUrl update best-effort */
      })
    }
  }
  return result
}

function filenameFromUrl(url: string, fallbackTitle: string): string {
  try {
    const base = new URL(url).pathname.split('/').pop()
    if (base && base.includes('.')) return base
  } catch {
    /* ignore */
  }
  const safe = fallbackTitle.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 80)
  return `${safe || 'image'}.jpg`
}

async function notify(tabId: number, text: string): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'TOAST', text })
  } catch {
    console.info('[AssetVault]', text)
  }
  try {
    const short = text.length > 6 ? `${text.slice(0, 5)}…` : text
    await chrome.action.setBadgeBackgroundColor({ color: '#2563eb' })
    await chrome.action.setBadgeText({ text: short || '…' })
  } catch {
    /* ignore */
  }
}

async function clearActionBadge(): Promise<void> {
  try {
    await chrome.action.setBadgeText({ text: '' })
  } catch {
    /* ignore */
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read blob'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(blob)
  })
}

const IMPORT_DOWNLOAD_TIMEOUT_MS = 60_000

function removeDownloadArtifacts(downloadId: number): Promise<void> {
  return new Promise((resolve) => {
    chrome.downloads.removeFile(downloadId, () => {
      chrome.downloads.erase({ id: downloadId }, () => resolve())
    })
  })
}

function waitForDownloadImport(args: {
  dataUrl: string
  downloadFilename: string
  targetFolderId?: string
  duplicatePolicy?: string
}): Promise<{ assetId?: string; skipped?: boolean }> {
  // Large data: URLs are truncated by chrome.downloads on Windows — prefer importFromDataUrl.
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url: args.dataUrl,
        filename: args.downloadFilename,
        saveAs: false,
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message))
        }
        if (downloadId === undefined) {
          return reject(new Error('Download failed to start'))
        }

        let settled = false
        const teardown = (listener: (delta: chrome.downloads.DownloadDelta) => void) => {
          clearTimeout(timeoutId)
          chrome.downloads.onChanged.removeListener(listener)
        }
        const finish = (
          listener: (delta: chrome.downloads.DownloadDelta) => void,
          fn: () => void,
        ) => {
          if (settled) return
          settled = true
          teardown(listener)
          fn()
        }

        const onChanged = (delta: chrome.downloads.DownloadDelta) => {
          if (delta.id !== downloadId) return

          if (delta.state?.current === 'complete') {
            finish(onChanged, () => {
              chrome.downloads.search({ id: downloadId }, (results) => {
                if (!results?.length || !results[0].filename) {
                  void removeDownloadArtifacts(downloadId)
                  reject(new Error('Failed to find downloaded file'))
                  return
                }
                const filePath = results[0].filename
                void (async () => {
                  try {
                    const res = await importAsset({
                      filePath,
                      targetFolderId: args.targetFolderId,
                      duplicatePolicy: args.duplicatePolicy,
                    })
                    await removeDownloadArtifacts(downloadId)
                    resolve(res)
                  } catch (e) {
                    await removeDownloadArtifacts(downloadId)
                    reject(e)
                  }
                })()
              })
            })
            return
          }

          if (delta.state?.current === 'interrupted' || delta.error) {
            finish(onChanged, () => {
              void removeDownloadArtifacts(downloadId)
              reject(
                new Error(
                  delta.error?.current
                    ? `Download failed: ${delta.error.current}`
                    : 'Download interrupted',
                ),
              )
            })
          }
        }

        const timeoutId = setTimeout(() => {
          finish(onChanged, () => {
            void removeDownloadArtifacts(downloadId)
            reject(new Error('截图保存超时'))
          })
        }, IMPORT_DOWNLOAD_TIMEOUT_MS)

        chrome.downloads.onChanged.addListener(onChanged)
      },
    )
  })
}

async function importDataUrlViaDownload(args: {
  dataUrl: string
  filename: string
  targetFolderId?: string
  duplicatePolicy?: string
  /** Use longer API timeout for large full-page strips. */
  apiTimeoutMs?: number
  /** Max data: URL string length for direct POST; 0 = always download+filePath. */
  maxDirectImportJsonChars?: number
}): Promise<{ assetId?: string; skipped?: boolean }> {
  // Board Saver batch data: URIs only — screenshots use importScreenshotCanvas instead.
  const maxJsonChars = args.maxDirectImportJsonChars ?? DATAURL_MAX_DIRECT_JSON_CHARS
  const useDirectApi = dataUrlFitsDirectImport(args.dataUrl, maxJsonChars)

  if (useDirectApi) {
    try {
      const direct = await importFromDataUrl(
        {
          dataUrl: args.dataUrl,
          filename: args.filename,
          targetFolderId: args.targetFolderId,
          duplicatePolicy: args.duplicatePolicy,
        },
        { timeoutMs: args.apiTimeoutMs ?? 10_000 },
      )
      if (!direct.skipped || args.duplicatePolicy !== 'import_copy') {
        return direct
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!/body too large|INVALID_REQUEST/i.test(msg)) {
        // Non-size errors: still try download path below.
      }
    }
  }

  const maxAttempts = args.duplicatePolicy === 'import_copy' ? 2 : 1
  let last: { assetId?: string; skipped?: boolean } = { skipped: true }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    last = await waitForDownloadImport({
      dataUrl: args.dataUrl,
      downloadFilename: uniqueTempDownloadFilename(args.filename),
      targetFolderId: args.targetFolderId,
      duplicatePolicy: args.duplicatePolicy,
    })
    if (!last.skipped) return last
  }

  return last
}

async function dataUrlToImageBitmap(dataUrl: string): Promise<ImageBitmap> {
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  return await createImageBitmap(blob)
}

/** Export canvas to blob, lowering JPEG quality / scale until under size budget. */
async function canvasToImportBlob(
  canvas: OffscreenCanvas,
  format: 'jpeg' | 'png',
  maxBytes: number,
  options?: { bestEffort?: boolean },
): Promise<Blob> {
  let current: OffscreenCanvas = canvas
  let lastBlob: Blob | null = null

  const tryExport = async (): Promise<Blob | null> => {
    if (format === 'png') {
      const blob = await current.convertToBlob({ type: 'image/png' })
      lastBlob = blob
      return blob.size <= maxBytes ? blob : null
    }
    for (const quality of [0.88, 0.75, 0.62, 0.5, 0.38, 0.28]) {
      const blob = await current.convertToBlob({ type: 'image/jpeg', quality })
      lastBlob = blob
      if (blob.size <= maxBytes) return blob
    }
    return null
  }

  for (let pass = 0; pass < 4; pass++) {
    const blob = await tryExport()
    if (blob) return blob
    const w = Math.max(1, Math.floor(current.width * 0.75))
    const h = Math.max(1, Math.floor(current.height * 0.75))
    if (w === current.width && h === current.height) break
    const scaled = new OffscreenCanvas(w, h)
    const ctx = scaled.getContext('2d')
    if (!ctx) break
    ctx.drawImage(current, 0, 0, w, h)
    current = scaled
  }

  if (options?.bestEffort && lastBlob) return lastBlob
  if (options?.bestEffort) {
    return current.convertToBlob({
      type: format === 'png' ? 'image/png' : 'image/jpeg',
      quality: format === 'png' ? undefined : 0.28,
    } as { type: string; quality?: number })
  }

  throw new Error(
    format === 'png'
      ? '截图分片过大（PNG），请改用 JPEG 或缩小区域'
      : '截图分片过大，无法导入（请缩小区域或降低画质）',
  )
}

function cropCanvasTop(canvas: OffscreenCanvas, heightPx: number): OffscreenCanvas {
  return cropCanvasRect(canvas, 0, 0, canvas.width, heightPx)
}

function cropCanvasRect(
  canvas: OffscreenCanvas,
  sx: number,
  sy: number,
  widthPx: number,
  heightPx: number,
): OffscreenCanvas {
  const w = Math.max(1, Math.min(Math.round(widthPx), canvas.width - sx))
  const h = Math.max(1, Math.min(Math.round(heightPx), canvas.height - sy))
  if (w === canvas.width && h === canvas.height && sx === 0 && sy === 0) return canvas
  const cropped = new OffscreenCanvas(w, h)
  const ctx = cropped.getContext('2d')
  if (!ctx) throw new Error('No 2d context')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(canvas, sx, sy, w, h, 0, 0, w, h)
  return cropped
}

/**
 * One library asset per canvas (region / element crop).
 * 1) Compress to fit POST /asset/importFromDataUrl
 * 2) Else blob: URL download → /asset/import (one file, not 145px slices)
 */
async function importScreenshotCanvas(args: {
  canvas: OffscreenCanvas
  format: 'jpeg' | 'png'
  filenameBase: string
  targetFolderId?: string
  duplicatePolicy?: 'use_existing' | 'import_copy'
  apiTimeoutMs?: number
}): Promise<{ assetIds: string[]; chunkErrors: number }> {
  const ext = args.format === 'png' ? '.png' : '.jpg'
  const filename = `${args.filenameBase}${ext}`
  const policy = args.duplicatePolicy ?? 'import_copy'
  const timeoutMs = args.apiTimeoutMs ?? FULLPAGE_IMPORT_API_TIMEOUT_MS

  const tryDirectImport = async (bestEffort: boolean): Promise<string | null> => {
    try {
      const blob = await canvasToImportBlob(
        args.canvas,
        args.format,
        FULLPAGE_IMPORT_CHUNK_MAX_BYTES,
        { bestEffort },
      )
      const dataUrl = await blobToDataUrl(blob)
      if (!dataUrlFitsDirectImport(dataUrl)) return null
      const result = await importFromDataUrl(
        {
          dataUrl,
          filename,
          targetFolderId: args.targetFolderId,
          duplicatePolicy: policy,
        },
        { timeoutMs },
      )
      if (result.skipped || !result.assetId) return null
      return result.assetId
    } catch {
      return null
    }
  }

  let assetId = await tryDirectImport(false)
  if (!assetId) assetId = await tryDirectImport(true)

  if (assetId) return { assetIds: [assetId], chunkErrors: 0 }

  try {
    const blob = await canvasToImportBlob(
      args.canvas,
      args.format,
      8 * 1024 * 1024,
      { bestEffort: true },
    )
    const { filePath, downloadId } = await downloadBlobToRelativeFilename(
      blob,
      uniqueTempDownloadFilename(filename)
    )
    try {
      const res = await importAsset({
        filePath,
        targetFolderId: args.targetFolderId,
        duplicatePolicy: policy,
      })
      if (!res.skipped && res.assetId) {
        return { assetIds: [res.assetId], chunkErrors: 0 }
      }
    } finally {
      await removeDownloadArtifacts(downloadId)
    }
  } catch (e) {
    console.warn('[AssetVault] screenshot blob download import failed', e)
  }

  return { assetIds: [], chunkErrors: 1 }
}

async function cropAndImportRect(args: {
  tabId: number
  message: Extract<BgMessage, { type: 'SCREENSHOT_CROP_RECT' }>
  prefs: Awaited<ReturnType<typeof getPreferences>>
}): Promise<void> {
  const tab = await chrome.tabs.get(args.tabId)
  if (!tab?.windowId) throw new Error('Missing windowId')

  const dpr = args.message.dpr
  const rect = args.message.rect

  const format = args.message.format ?? 'jpeg'
  const captureOptions =
    format === 'png'
      ? ({ format: 'png' } as chrome.tabs.CaptureVisibleTabOptions)
      : ({ format: 'jpeg', quality: 100 } as chrome.tabs.CaptureVisibleTabOptions)

  const dataUrl = await captureVisibleTabThrottled(tab.windowId, captureOptions)
  const bitmap = await dataUrlToImageBitmap(dataUrl)

  const sx = Math.max(0, Math.round(rect.x * dpr))
  const sy = Math.max(0, Math.round(rect.y * dpr))
  const sw = Math.max(1, Math.round(rect.width * dpr))
  const sh = Math.max(1, Math.round(rect.height * dpr))

  // Clamp to bitmap bounds
  const clampedSw = Math.min(sw, bitmap.width - sx)
  const clampedSh = Math.min(sh, bitmap.height - sy)
  if (clampedSw <= 0 || clampedSh <= 0) throw new Error('选择区域超出截图范围')

  const off = new OffscreenCanvas(clampedSw, clampedSh)
  const ctx = off.getContext('2d')
  if (!ctx) throw new Error('No 2d context')
  ctx.drawImage(bitmap, sx, sy, clampedSw, clampedSh, 0, 0, clampedSw, clampedSh)

  const exportFormat = format === 'png' ? 'png' : 'jpeg'
  const { assetIds, chunkErrors } = await importScreenshotCanvas({
    canvas: off,
    format: exportFormat,
    filenameBase: `screenshot-${args.message.mode}-${Date.now()}`,
    targetFolderId: args.prefs.defaultFolderId || undefined,
    duplicatePolicy: 'import_copy',
  })

  if (!assetIds.length) {
    throw new Error(chunkErrors ? '截图保存失败' : '截图未入库')
  }

  const msg = assetIds.length > 1 ? `截图已保存（${assetIds.length} 张）` : '截图已保存'
  await notify(args.tabId, msg)
  await clearActionBadge()
}

async function stitchAndImportFullPage(args: {
  tab: chrome.tabs.Tab
  prefs: Awaited<ReturnType<typeof getPreferences>>
  format?: 'jpeg' | 'png'
}): Promise<void> {
  if (!args.tab.id || !args.tab.windowId) throw new Error('Missing tabId/windowId')
  const tabId = args.tab.id
  setFullpageCaptureActive(tabId)
  resetFullPageSessionSupportCache()

  let setup: Awaited<ReturnType<typeof setupFullpageInTab>>
  try {
    setup = await setupFullpageInTab(tabId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`无法获取页面滚动高度信息：${msg}`)
  }

  const viewportCss = Math.max(1, Math.round(setup.viewportHeightCss))
  const innerWidthCss = Math.max(1, Math.round(setup.innerWidthCss))
  let scrollPlan = planFullpageCapturePositions({
    scrollHeightCss: Math.max(1, Math.round(setup.scrollHeightCss)),
    viewportCss,
    maxSegments: 0,
  })

  const captureOptions =
    args.format === 'png'
      ? ({ format: 'png' } as chrome.tabs.CaptureVisibleTabOptions)
      : ({ format: 'jpeg', quality: 92 } as chrome.tabs.CaptureVisibleTabOptions)

  const buffer = new FullpageOutputBuffer({
    scrollHeightCss: Math.max(1, Math.round(setup.scrollHeightCss)),
    innerWidthCss,
    viewportCss,
    scrollPlan,
  })

  if (scrollPlan.truncated) {
    await notify(
      tabId,
      `页面过长，整页截图仅覆盖前 ${Math.round(buffer.effectiveScrollHeightCss / viewportCss)} 屏高度`,
    )
    await sleep(1200)
  }

  const capturePositions = [...scrollPlan.positions]
  await notify(tabId, `整页截图中 0/${capturePositions.length}…`)

  let restored = false
  const restore = async () => {
    if (restored) return
    restored = true
    await restoreFullpageInTab(tabId)
  }

  let segmentsCompleted = 0
  let captureStoppedEarly = false
  let captureStopReason = ''

  try {
    for (let i = 0; i < capturePositions.length; i++) {
      if (isFullpageCaptureAborted(tabId)) {
        await notify(tabId, '整页截图已取消')
        await clearActionBadge()
        return
      }

      if (i > 0 && i % FULLPAGE_REMETRICS_EVERY_SEGMENTS === 0) {
        const metrics = await readFullpageScrollMetricsInTab(tabId)
        if (metrics) {
          const added = buffer.extendScrollHeightIfTaller(metrics.scrollHeightCss)
          capturePositions.push(...added)
        }
      }
      if (i === capturePositions.length - 1) {
        const metrics = await readFullpageScrollMetricsInTab(tabId)
        if (metrics) {
          const added = buffer.extendScrollHeightIfTaller(metrics.scrollHeightCss)
          capturePositions.push(...added)
        }
      }

      const yCss = capturePositions[i]!
      const isLastCapture = i === capturePositions.length - 1

      try {
        if (isLastCapture) {
          await applyFullpageLastFrameFloatingHides(tabId)
        }

        await scrollFullpageToCss(tabId, yCss)
        const viewportDataUrl = await captureVisibleTabThrottled(args.tab.windowId, captureOptions)
        const bitmap = await dataUrlToImageBitmap(viewportDataUrl)

        try {
          buffer.initFromFirstBitmap(bitmap)
          buffer.drawSegment(bitmap, yCss, segmentsCompleted === 0)
        } finally {
          bitmap.close()
        }

        segmentsCompleted++
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e)
        if (reason.includes('滚动未到位')) throw e
        if (segmentsCompleted === 0 || !buffer.initialized) throw e
        if (!isAllowPartialCaptureStop(reason)) throw e
        captureStoppedEarly = true
        captureStopReason = reason
        break
      }

      if (i % 2 === 0 || i === capturePositions.length - 1) {
        const progress = capturePositions.length === 1 ? 1 : (i + 1) / capturePositions.length
        await notify(tabId, `整页截图中 ${i + 1}/${capturePositions.length} · ${Math.floor(progress * 100)}%…`)
      }
    }

    await restore()

    if (isFullpageCaptureAborted(tabId)) {
      await notify(tabId, '整页截图已取消')
      await clearActionBadge()
      return
    }

    if (!buffer.initialized || segmentsCompleted === 0 || buffer.maxContentBottomPx <= 0) {
      throw new Error('未能截取任何画面')
    }

    const exportHeightPx = Math.min(buffer.totalHeightPx, buffer.maxContentBottomPx)
    const exportFormat = args.format === 'png' ? 'png' : 'jpeg'
    const stamp = Date.now()

    await notify(tabId, '整页截图合成并保存中…')

    const { canvases: stripSources, heights: stripHeights } = buffer.exportStrips(exportHeightPx)
    if (!stripSources.length) {
      throw new Error('整页截图无有效分片')
    }
    const stitchedContentHeightPx = stripHeights.reduce((sum, h) => sum + h, 0)

    const partialReasons: string[] = []
    if (buffer.scrollPlan.truncated) partialReasons.push('页面高度超限，仅覆盖前段')
    if (captureStoppedEarly) partialReasons.push(`采集未完成（${captureStopReason || '中途错误'}）`)

    const allowPartial = buffer.scrollPlan.truncated || captureStoppedEarly
    const captureScale = buffer.captureScale
    const devicePixelRatio = Math.max(0.01, Math.round(captureScale * 100) / 100)

    if (!(await supportsFullPageSessionApi())) {
      throw new Error('AssetVault Pro 未提供整页截图 API，请更新并重启桌面端')
    }

    const finished = await importFullPageViaSession({
      strips: stripSources,
      stripHeightsPx: stripHeights,
      widthPx: buffer.widthPx,
      contentHeightPx: stitchedContentHeightPx,
      overlapPx: 0,
      devicePixelRatio,
      format: exportFormat,
      filenameBase: `screenshot-fullpage-${stamp}`,
      inspectSessionId: fullPageInspectSessionId(stamp),
      targetFolderId: args.prefs.defaultFolderId || undefined,
      pageUrl: args.tab.url ?? '',
      pageTitle: args.tab.title ?? '',
      allowPartial,
      shouldAbort: () => isFullpageCaptureAborted(tabId),
    })

    if (!finished.assetId && !finished.skipped) {
      throw new Error('整页截图未入库')
    }

    partialReasons.push(...mapFullPageFinishWarnings(finished.warnings))
    if (finished.tempDir && FULLPAGE_KEEP_STRIP_FILES_AFTER_FINISH) {
      partialReasons.push(`条带目录: ${finished.tempDir}`)
    }

    const msg =
      partialReasons.length > 0
        ? `整页截图已保存（1 张长图）· ${partialReasons.join('；')}`
        : '整页截图已保存'
    await notify(tabId, msg)
    await clearActionBadge()
  } finally {
    clearFullpageCaptureActive(tabId)
    await restore().catch(() => null)
  }
}
