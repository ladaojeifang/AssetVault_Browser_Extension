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
}): Promise<{ ok: true; batch: unknown }> {
  const { items, tagIds, reportTabId, sourceUrl } = args
  const prefs = await getPreferences()

  const total = items.length
  let completed = 0
  const queue = new ConcurrencyQueue(BATCH_DOWNLOAD_CONCURRENCY)

  // Split into sub-batches to respect API batch limits while controlling concurrency
  const results: Array<{ imported: string[]; skipped: Array<{ url: string; reason: string; existingAssetId?: string }>; errors: Array<{ url: string; message: string }> }> = []

  // Process in chunks that fit within concurrency limits
  const chunkSize = BATCH_DOWNLOAD_CONCURRENCY
  for (let i = 0; i < total; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize)
    await queue.add(async () => {
      const batch = await importFromUrlBatch({
        items: chunk,
        targetFolderId: prefs.defaultFolderId || undefined,
        duplicatePolicy: prefs.duplicatePolicy
      })
      if (tagIds?.length && batch.imported.length) {
        await assignTags(batch.imported, tagIds)
      }
      // Set sourceUrl for each newly imported asset
      if (sourceUrl && batch.imported.length) {
        await Promise.allSettled(
          batch.imported.map(id => updateAsset({ id, sourceUrl }))
        )
      }
      results.push(batch)
      completed += chunk.length

      // Report progress to tab
      if (reportTabId && total > 1) {
        try {
          void notify(
            reportTabId,
            `批量导入进度：${Math.min(completed, total)}/${total}`
          )
        } catch { /* ignore notification errors */ }
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

/** Active full-page screenshot job; set abort flag via SCREENSHOT_ABORT. */
let activeFullpageCapture: { tabId: number; abort: boolean } | null = null

/** Chrome MV3: ~2 captureVisibleTab calls per second per extension. */
const CAPTURE_MIN_GAP_MS = 650
let lastCaptureVisibleTabAt = 0

// 整页截图思路：滚动分段 + 重叠，隐藏 fixed/sticky，暂停视频，避免拼接缝和重复内容。
const FULLPAGE_AFTER_SCROLL_MS = 520
const FULLPAGE_MAX_SCROLL_SEGMENTS = 25
const FULLPAGE_OVERLAP_CSS_MAX = 200
// 保守的 Canvas 限制：避免 OffscreenCanvas / GPU 纹理上限导致转 blob 失败。
const FULLPAGE_CANVAS_MAX_SIDE = 16384
const FULLPAGE_CANVAS_MAX_PIXELS = 80_000_000

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

chrome.runtime.onInstalled.addListener(() => {
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
        sourceUrl: (message as unknown as { sourceUrl?: string }).sourceUrl || undefined
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
      void stitchAndImportFullPage({ tab, prefs, format: message.format }).catch(async (e) => {
        const msg = e instanceof Error ? e.message : String(e)
        const userMsg =
          isCaptureQuotaError(e) || msg.includes('截图频率')
            ? '整页截图过快，请稍候再试（Chrome 限制每秒截图次数）'
            : msg
        await notify(tabId, userMsg)
      })
      return { ok: true, started: true }
    }
    case 'SCREENSHOT_ABORT': {
      if (activeFullpageCapture) {
        activeFullpageCapture.abort = true
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
  let toastOk = false
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'TOAST', text })
    toastOk = true
  } catch {
    console.info('[AssetVault]', text)
  }
  if (!toastOk) {
    try {
      const short = text.length > 6 ? `${text.slice(0, 5)}…` : text
      await chrome.action.setBadgeBackgroundColor({ color: '#2563eb' })
      await chrome.action.setBadgeText({ text: short || '…' })
    } catch {
      /* ignore */
    }
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

async function importDataUrlViaDownload(args: {
  dataUrl: string
  filename: string
  targetFolderId?: string
  duplicatePolicy?: string
}): Promise<{ assetId?: string; skipped?: boolean }> {
  // Prefer direct dataUrl API for screenshot flow so duplicatePolicy is applied on logical content import.
  // Keep downloads fallback for oversized payloads or transient API errors.
  try {
    return await importFromDataUrl({
      dataUrl: args.dataUrl,
      filename: args.filename,
      targetFolderId: args.targetFolderId,
      duplicatePolicy: args.duplicatePolicy
    })
  } catch {
    // fallback to download+filePath path below
  }

  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url: args.dataUrl,
        filename: `AssetVault_Temp/${args.filename}`,
        saveAs: false
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
          fn: () => void
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
                      duplicatePolicy: args.duplicatePolicy
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
                    : 'Download interrupted'
                )
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
      }
    )
  })
}

async function dataUrlToImageBitmap(dataUrl: string): Promise<ImageBitmap> {
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  return await createImageBitmap(blob)
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
      : ({ format: 'jpeg', quality: 90 } as chrome.tabs.CaptureVisibleTabOptions)

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

  const outBlob = await off.convertToBlob({
    type: format === 'png' ? 'image/png' : 'image/jpeg',
    quality: format === 'png' ? undefined : 0.9
  } as any)
  const croppedDataUrl = await blobToDataUrl(outBlob)

  const ext = format === 'png' ? '.png' : '.jpg'
  const filename = `screenshot-${args.message.mode}-${Date.now()}${ext}`

  const importResult = await importDataUrlViaDownload({
    dataUrl: croppedDataUrl,
    filename,
    targetFolderId: args.prefs.defaultFolderId || undefined,
    // Screenshot should always create a new asset even if temp source path repeats.
    duplicatePolicy: 'import_copy'
  })

  const msg = importResult.skipped ? '已存在（跳过）' : '截图已保存'
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
  activeFullpageCapture = { tabId, abort: false }

  const isAborted = () => activeFullpageCapture?.abort === true

  const setup = await chrome.scripting
    .executeScript({
      target: { tabId },
      func: () => {
        const FLAG_SCROLL_EL = '__assetvault_fullpage_scroll_el__'
        const FLAG_RESTORE = '__assetvault_fullpage_restore__'

        const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

        // 策略：选择"最主要的滚动容器"而不是一律 scrollTo(window)。
        const getMainScrollElement = (): HTMLElement => {
          const candidates: HTMLElement[] = []
          const nodes = Array.from(document.querySelectorAll<HTMLElement>('*'))
          for (const el of nodes) {
            if (!el) continue
            const style = getComputedStyle(el)
            const overflowY = style.overflowY
            if (!(overflowY?.includes('auto') || overflowY?.includes('scroll'))) continue
            if (style.visibility === 'hidden' || style.display === 'none') continue
            if (el.scrollHeight > el.clientHeight + 1) candidates.push(el)
          }
          // documentElement / body 也算候选，保证至少有一个。
          if (document.documentElement.scrollHeight > document.documentElement.clientHeight + 1) {
            candidates.push(document.documentElement)
          }
          if (document.body?.scrollHeight > document.body.clientHeight + 1) candidates.push(document.body)
          if (!candidates.length) return document.documentElement

          // 优先选 scrollHeight 更大、clientHeight 更接近用户视口的容器。
          const vw = window.innerWidth
          const vh = window.innerHeight
          candidates.sort((a, b) => {
            const aScore = (a.scrollHeight - a.clientHeight) * 2 + Math.min(a.clientHeight, vh) / vh + Math.min(a.clientWidth, vw) / vw
            const bScore = (b.scrollHeight - b.clientHeight) * 2 + Math.min(b.clientHeight, vh) / vh + Math.min(b.clientWidth, vw) / vw
            return bScore - aScore
          })
          return candidates[0]
        }

        const scrollEl = getMainScrollElement()
        ;(window as any)[FLAG_SCROLL_EL] = scrollEl

        const viewportHeightCss = scrollEl === document.documentElement || scrollEl === document.body ? window.innerHeight : scrollEl.clientHeight
        const scrollHeightCss = Math.max(0, scrollEl.scrollHeight)

        const restoreState: any = { fixed: [] as any[], videos: [] as any[], scrollTop: 0 }
        // 保存当前滚动位置，结束后恢复。
        restoreState.scrollTop =
          scrollEl === document.documentElement || scrollEl === document.body ? window.scrollY : (scrollEl as any).scrollTop || 0

        // 隐藏 fixed/sticky 浮层，减少拼接时重复绘制/遮挡。
        const shouldHideFloating = (el: HTMLElement): boolean => {
          const style = getComputedStyle(el)
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false
          const pos = style.position
          if (pos !== 'fixed' && pos !== 'sticky') return false
          // 仅隐藏当前可见区域里大概率会影响截图的元素。
          const r = el.getBoundingClientRect()
          const inView = r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth
          if (!inView) return false
          // 排除过小元素，避免影响布局缓存/性能。
          if (r.width * r.height < 4000) return false
          return true
        }

        const fixedCandidates = Array.from(document.querySelectorAll<HTMLElement>('*')).filter((el) => shouldHideFloating(el))
        for (const el of fixedCandidates) {
          restoreState.fixed.push({
            el,
            visibility: el.style.visibility,
            pointerEvents: el.style.pointerEvents,
            opacity: el.style.opacity
          })
          el.setAttribute('data-assetvault-fullpage-hidden', '1')
          el.style.visibility = 'hidden'
          el.style.pointerEvents = 'none'
          // opacity 也降一下，减少合成闪烁
          el.style.opacity = '0'
        }

        // 暂停播放中的视频，避免滚动时帧变化导致拼接出现"跳帧"。
        const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('video'))
        for (const v of videos) {
          if (v.paused) continue
          restoreState.videos.push({ v, shouldResume: true })
          try {
            v.pause()
          } catch {
            // ignore
          }
        }

        ;(window as any)[FLAG_RESTORE] = restoreState

        const FLAG_ABORT_KEY = '__assetvault_fullpage_abort_key__'
        const onAbortKey = (e: KeyboardEvent) => {
          if (e.key === 'Escape') void chrome.runtime.sendMessage({ type: 'SCREENSHOT_ABORT' })
        }
        document.addEventListener('keydown', onAbortKey)
        ;(window as any)[FLAG_ABORT_KEY] = onAbortKey

        return {
          scrollHeightCss,
          viewportHeightCss: clamp(viewportHeightCss, 1, 10_000_000),
          innerWidthCss: window.innerWidth,
          dpr: window.devicePixelRatio || 1
        }
      }
    })
    .then((xs) => xs[0]?.result as any)
    .catch(() => null)

  if (!setup) throw new Error('无法获取页面滚动高度信息')

  const scrollHeightCss = Math.max(1, Math.round(setup.scrollHeightCss))
  const viewportCss = Math.max(1, Math.round(setup.viewportHeightCss))
  const innerWidthCss = Math.max(1, Math.round(setup.innerWidthCss))

  const captureOptions =
    args.format === 'png'
      ? ({ format: 'png' } as chrome.tabs.CaptureVisibleTabOptions)
      : ({ format: 'jpeg', quality: 90 } as chrome.tabs.CaptureVisibleTabOptions)

  // 生成滚动采集位置：带固定重叠（用于避免拼接缝），并限制最大段数避免 quota。
  const maxSegments = Math.max(2, FULLPAGE_MAX_SCROLL_SEGMENTS)
  const overlapTargetCss = Math.min(FULLPAGE_OVERLAP_CSS_MAX, viewportCss)
  const baseStepCss = Math.max(1, viewportCss - overlapTargetCss)
  const minStepForQuotaCss =
    scrollHeightCss <= viewportCss ? viewportCss : Math.ceil((scrollHeightCss - viewportCss) / Math.max(1, maxSegments - 1))
  const stepCss = Math.max(baseStepCss, minStepForQuotaCss)
  const overlapCss = Math.max(0, viewportCss - stepCss)

  const capturePositions: number[] = []
  if (scrollHeightCss <= viewportCss + 1) {
    capturePositions.push(0)
  } else {
    for (let y = 0; y + viewportCss < scrollHeightCss - 1; y += stepCss) {
      capturePositions.push(Math.max(0, Math.round(y)))
    }
    const lastY = Math.max(0, Math.round(scrollHeightCss - viewportCss))
    if (capturePositions.length === 0 || capturePositions[capturePositions.length - 1] !== lastY) {
      capturePositions.push(lastY)
    }
  }

  if (capturePositions.length > maxSegments + 3) {
    // 兜底：如果某些奇怪页面使计算膨胀，直接拒绝以免进一步触发 quota。
    throw new Error('整页截图段数过多，已拒绝生成（避免触发浏览器截图限额）')
  }

  await notify(tabId, `整页截图中 0/${capturePositions.length}…`)

  const scrollToCss = async (yCss: number): Promise<void> => {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (yy: number) => {
        const scrollEl = (window as any)['__assetvault_fullpage_scroll_el__'] as HTMLElement | undefined
        if (scrollEl && scrollEl !== document.documentElement && scrollEl !== document.body) {
          ;(scrollEl as any).scrollTo(0, yy)
        } else {
          window.scrollTo(0, yy)
        }
      },
      args: [yCss]
    }).catch(() => null)

    // 给布局/懒加载一点时间
    await sleep(FULLPAGE_AFTER_SCROLL_MS)
  }

  const overlapPxFromScale = (scale: number) => Math.max(0, Math.round(overlapCss * scale))

  // Lazy init: 第一次 captureVisibleTab 返回后，依据其实际像素宽度推导缩放比例。
  let widthPx = 0
  let totalHeightPx = 0
  let overlapPx = 0
  let captureScale = 1

  let outputCanvases: OffscreenCanvas[] = []
  let outputCtxs: OffscreenCanvasRenderingContext2D[] = []
  let outputStripHeightPx = 0
  let outputCount = 0

  const ensureOutputs = (firstBitmap: ImageBitmap) => {
    if (widthPx) return
    widthPx = firstBitmap.width
    captureScale = widthPx / innerWidthCss
    totalHeightPx = Math.max(1, Math.round(scrollHeightCss * captureScale))
    overlapPx = overlapPxFromScale(captureScale)

    if (widthPx > FULLPAGE_CANVAS_MAX_SIDE) {
      throw new Error('整页截图宽度过大，已拒绝生成（Canvas 限制）')
    }

    outputStripHeightPx = Math.min(
      FULLPAGE_CANVAS_MAX_SIDE,
      Math.max(1, Math.floor(FULLPAGE_CANVAS_MAX_PIXELS / Math.max(1, widthPx)))
    )
    if (outputStripHeightPx <= 0) throw new Error('整页截图画布上限不足，已拒绝生成')

    outputCount = Math.ceil(totalHeightPx / outputStripHeightPx)
    outputCanvases = []
    outputCtxs = []
    for (let i = 0; i < outputCount; i++) {
      const h = Math.min(outputStripHeightPx, totalHeightPx - i * outputStripHeightPx)
      const c = new OffscreenCanvas(widthPx, Math.max(1, h))
      const ctx = c.getContext('2d')
      if (!ctx) throw new Error('No 2d context')
      outputCanvases.push(c)
      outputCtxs.push(ctx)
    }
  }

  const drawToOutputs = (bitmap: ImageBitmap, srcCropTopPx: number, destStartPx: number, drawHeightPx: number) => {
    const destEndPx = destStartPx + drawHeightPx
    for (let k = 0; k < outputCount; k++) {
      const yStart = k * outputStripHeightPx
      const yEnd = Math.min(totalHeightPx, (k + 1) * outputStripHeightPx)
      const interStart = Math.max(destStartPx, yStart)
      const interEnd = Math.min(destEndPx, yEnd)
      const interH = interEnd - interStart
      if (interH <= 0) continue

      const srcY = srcCropTopPx + (interStart - destStartPx)
      const destY = interStart - yStart
      outputCtxs[k].drawImage(bitmap, 0, srcY, widthPx, interH, 0, destY, widthPx, interH)
    }
  }

  const originalUrl = args.tab.url
  let restored = false
  const restore = async () => {
    if (restored) return
    restored = true
    
    try {
      const currentTab = await chrome.tabs.get(tabId)
      if (currentTab.url !== originalUrl) return
    } catch {
      return
    }

    await chrome.scripting
      .executeScript({
        target: { tabId },
        func: () => {
          const FLAG_RESTORE = '__assetvault_fullpage_restore__'
          const FLAG_SCROLL_EL = '__assetvault_fullpage_scroll_el__'
          const FLAG_ABORT_KEY = '__assetvault_fullpage_abort_key__'

          const onAbortKey = (window as any)[FLAG_ABORT_KEY] as ((e: KeyboardEvent) => void) | undefined
          if (onAbortKey) {
            document.removeEventListener('keydown', onAbortKey)
            delete (window as any)[FLAG_ABORT_KEY]
          }

          const restoreState = (window as any)[FLAG_RESTORE] as
            | { fixed: Array<{ el: HTMLElement; visibility: string; pointerEvents: string; opacity: string }>; videos: Array<{ v: HTMLVideoElement; shouldResume: boolean }>; scrollTop: number }
            | undefined
          const scrollEl = (window as any)[FLAG_SCROLL_EL] as HTMLElement | undefined

          if (restoreState) {
            for (const f of restoreState.fixed) {
              try {
                f.el.style.visibility = f.visibility
                f.el.style.pointerEvents = f.pointerEvents
                f.el.style.opacity = f.opacity
                f.el.removeAttribute('data-assetvault-fullpage-hidden')
              } catch {
                // ignore
              }
            }
            for (const it of restoreState.videos) {
              if (!it.shouldResume) continue
              try {
                it.v.play().catch(() => null)
              } catch {
                // ignore
              }
            }
          }

          // 恢复截图前的滚动位置。
          const scrollTop = restoreState?.scrollTop ?? 0
          if (scrollEl && scrollEl !== document.documentElement && scrollEl !== document.body) {
            try {
              ;(scrollEl as any).scrollTo(0, scrollTop)
            } catch {
              // ignore
            }
          } else {
            try {
              window.scrollTo(0, scrollTop)
            } catch {
              // ignore
            }
          }

          delete (window as any)[FLAG_RESTORE]
          delete (window as any)[FLAG_SCROLL_EL]
        }
      })
      .catch(() => null)
  }

  try {
    for (let i = 0; i < capturePositions.length; i++) {
      if (isAborted()) {
        await notify(tabId, '整页截图已取消')
        await clearActionBadge()
        return
      }

      const yCss = capturePositions[i]

      // 滚动到目标位置
      await scrollToCss(yCss)

      // 每段 capture 之后推导输出画布尺寸（基于真实像素宽度）。
      const viewportDataUrl = await captureVisibleTabThrottled(args.tab.windowId, captureOptions)
      const bitmap = await dataUrlToImageBitmap(viewportDataUrl)

      ensureOutputs(bitmap)

      const isFirst = i === 0
      const srcCropTopPx = isFirst ? 0 : overlapPx
      const drawableHeightPx = Math.max(0, bitmap.height - srcCropTopPx)
      const destStartPx = Math.max(0, Math.round((yCss + (isFirst ? 0 : overlapCss)) * captureScale))
      const drawHeightPx = Math.max(0, Math.min(drawableHeightPx, totalHeightPx - destStartPx))

      if (drawHeightPx > 0) {
        drawToOutputs(bitmap, srcCropTopPx, destStartPx, drawHeightPx)
      }

      if (i % 2 === 0 || i === capturePositions.length - 1) {
        const progress = capturePositions.length === 1 ? 1 : (i + 1) / capturePositions.length
        await notify(tabId, `整页截图中 ${i + 1}/${capturePositions.length} · ${Math.floor(progress * 100)}%…`)
      }
    }

    await restore()

    if (isAborted()) {
      await notify(tabId, '整页截图已取消')
      await clearActionBadge()
      return
    }

    const ext = args.format === 'png' ? '.png' : '.jpg'
    const imported: Array<string | undefined> = []
    for (let k = 0; k < outputCount; k++) {
      if (isAborted()) {
        await notify(tabId, '整页截图已取消')
        await clearActionBadge()
        return
      }

      const c = outputCanvases[k]
      const outBlob = await c.convertToBlob({
        type: args.format === 'png' ? 'image/png' : 'image/jpeg',
        quality: args.format === 'png' ? undefined : 0.9
      } as any)
      const dataUrl = await blobToDataUrl(outBlob)

      const importResult = await importDataUrlViaDownload({
        dataUrl,
        filename: `screenshot-fullpage-${Date.now()}-${k + 1}-of-${outputCount}${ext}`,
        targetFolderId: args.prefs.defaultFolderId || undefined,
        duplicatePolicy: 'import_copy'
      })

      imported.push(importResult.assetId)
      if (k % 2 === 0 || k === outputCount - 1) {
        await notify(tabId, `整页截图分片保存中 ${k + 1}/${outputCount}…`)
      }
    }

    const msg = '整页截图已提交保存'
    await notify(tabId, msg)
    await clearActionBadge()
  } finally {
    activeFullpageCapture = null
    await restore().catch(() => null)
  }
}
