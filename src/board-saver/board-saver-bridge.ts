/**
 * Board Saver — Eagle-style batch collector
 * Direct DOM injection (no iframe), runs in content script context.
 * Scans page images, renders floating right-side panel with filters & download.
 */

import { collectBoardSaverItems } from './board-saver-scan-collect'
import { collectBoardSaverVideoPages } from './board-saver-video-discover'
import { type BoardSaverItem, SCAN_INTERVAL_MS, MAX_ITEMS } from './board-saver-types'
import {
  type PageType,
  resolvePostImportAction,
} from './board-saver-scan-state'
import {
  formatImportSummary,
  hasImportedAssets,
} from './board-saver-import'
import { BoardSaverLazyScroll } from './board-saver-lazy-scroll'
import { classifyPageType, isMediaDomNode } from './board-saver-page-detection'
import { loadBoardSaverSettings, saveBoardSaverSettings } from './board-saver-settings'
import {
  appendBoardSaverHistory,
  clearBoardSaverHistory,
  readBoardSaverHistory,
  renderBoardSaverHistoryPanel,
} from './board-saver-history'
import { runBoardSaverBatchImport, runBoardSaverVideoPageImport } from './board-saver-import-flow'
import {
  BOARD_SAVER_ROOT_ID,
  createBoardSaverCard,
  createBoardSaverPanelRoot,
  renderImportSummaryPanel,
  showBoardSaverToast,
} from './board-saver-panel'
import { updateBoardSaverFilterSidebar } from './board-saver-filter-sidebar'
import { createBoardSaverId } from './board-saver-utils'
import {
  mountBoardSaver,
  unmountBoardSaver,
  type BoardSaverHost,
} from './board-saver-lifecycle'
import {
  appendBoardSaverCards,
  applyBoardSaverFilters,
  applyBoardSaverSizeSort,
  syncBoardSaverCardSelection,
} from './board-saver-grid'
import { createQuickSaveClickHandler } from './board-saver-quick-save'
import { startBoardSaverScrollWatch } from './board-saver-scroll-watch'

/* ------------------------------------------------------------------ */
/*  Constants                                                            */
/* ------------------------------------------------------------------ */

const lazyScroll = new BoardSaverLazyScroll()
const idCounter = { value: 0 }

/* ------------------------------------------------------------------ */
/*  State                                                               */
/* ------------------------------------------------------------------ */

const items: BoardSaverItem[] = []
const seenUrls = new Set<string>()
let scanTimer: ReturnType<typeof setInterval> | null = null
let state: 'idle' | 'scanning' | 'importing' = 'idle'
let totalItems = 0
let mounted = false
let pageUrl = ''
let pageTitle = ''
let overlayEl: HTMLElement | null = null

let pageType: PageType = 'unknown'
let detectObserver: MutationObserver | null = null
let domChangeCount = 0
let scrollComplete = false
let scrollWatchCleanup: (() => void) | null = null

let setFilterSize = 'all'
let setFilterFormat = 'all'
let setFilterDomain = 'all'
let searchKeyword = ''
let quickSaveMode = false
let sortBySize = false
let hideLowQuality = false
let editMode = false
const editedFilenames = new Map<string, string>()
const quickSaveClickHandler = createQuickSaveClickHandler({
  overlayRootId: BOARD_SAVER_ROOT_ID,
  onToast: (text) => showToast(text),
})

function editContext() {
  return {
    items,
    editedFilenames,
    onStatus: setStatus,
    onToast: showToast,
  }
}

/* ------------------------------------------------------------------ */
/*  Panel settings persistence                                           */
/* ------------------------------------------------------------------ */

async function saveSettings(): Promise<void> {
  await saveBoardSaverSettings({
    filterSize: setFilterSize,
    filterFormat: setFilterFormat,
    filterDomain: setFilterDomain,
    sortBySize,
    hideLowQuality,
  })
}

async function loadSettings(): Promise<void> {
  const s = await loadBoardSaverSettings()
  if (!s) return
  if (s.filterSize) setFilterSize = s.filterSize
  if (s.filterFormat) setFilterFormat = s.filterFormat
  if (s.filterDomain) setFilterDomain = s.filterDomain
  if (s.sortBySize !== undefined) sortBySize = s.sortBySize
  if (s.hideLowQuality !== undefined) hideLowQuality = s.hideLowQuality
}

function genId(): string { return createBoardSaverId(idCounter) }
function el<T extends HTMLElement>(id: string): T { return document.getElementById(id) as T }

/* ------------------------------------------------------------------ */
/*  Page Type Detection (static / lazy / waterfall)                      */
/* ------------------------------------------------------------------ */

/** Start 2‑second detection to classify the page. */
function startPageDetection(): void {
  pageType = 'unknown'
  domChangeCount = 0
  scrollComplete = false

  // Count only DOM additions of media elements
  if (detectObserver) detectObserver.disconnect()
  detectObserver = new MutationObserver((records) => {
    for (const r of records) {
      for (const node of r.addedNodes) {
        if (isMediaDomNode(node)) {
          domChangeCount++
          return
        }
      }
    }
  })
  detectObserver.observe(document.body, { childList: true, subtree: true })

  // After 2 seconds, classify
  setTimeout(() => {
    detectObserver?.disconnect()
    detectObserver = null

    const sh = document.documentElement.scrollHeight
    const vh = window.innerHeight
    pageType = classifyPageType({ domChangeCount, scrollHeight: sh, viewportHeight: vh })

    if (pageType === 'static') {
      setStatus(`✅ 已采集全部 ${items.length} 项`)
    } else if (pageType === 'lazy') {
      setStatus(`🔍 懒加载页面 — 自动滚动中… 已采集 ${items.length} 项`)
      startScrollScan()
      if (!scanTimer) startPeriodic()
    } else {
      if (!scanTimer) startPeriodic()
      setStatus(`🔄 持续检测中… ${items.length} 项 | 滚动加载更多`)
    }
  }, 2000)
}

function currentFilterCriteria() {
  return {
    size: setFilterSize,
    format: setFilterFormat,
    domain: setFilterDomain,
    keyword: searchKeyword,
    hideLowQuality,
  }
}

/** After lazy auto-scroll ends, keep polling for user scroll / infinite load. */
function finishLazyScrollWithPeriodic(): void {
  lazyScroll.stop()
  scrollComplete = true
  if (!scanTimer) startPeriodic()
  setStatus(`🔄 持续检测中… ${items.length} 项 | 滚动加载更多`)
}

/** Auto-scroll lazy pages using shared lazy-scroll controller. */
async function startScrollScan(): Promise<void> {
  if (pageType !== 'lazy' || scrollComplete || state === 'importing') return

  if (lazyScroll.paused) {
    state = 'scanning'
    lazyScroll.resume()
    return
  }

  state = 'scanning'
  lazyScroll.start({
    shouldPause: () => state === 'importing',
    onTick: (percent) => {
      void doScan()
      setStatus(`🔍 自动滚动… ${Math.round(percent * 100)}% | ${items.length} 项`)
    },
    onBottomReached: () => {
      finishLazyScrollWithPeriodic()
    },
    onMaxDuration: () => {
      finishLazyScrollWithPeriodic()
    },
  })
}

function stopPageDetection(): void {
  if (detectObserver) { detectObserver.disconnect(); detectObserver = null }
  lazyScroll.stop()
  scrollComplete = true
  pageType = 'unknown'
}

async function scanPage(): Promise<BoardSaverItem[]> {
  const imageResult = await collectBoardSaverItems({
    pageUrl,
    pageTitle,
    seenUrls,
    totalItems,
    maxItems: MAX_ITEMS,
    nextId: genId,
  })
  totalItems = imageResult.totalItems
  const videoResult = collectBoardSaverVideoPages({
    pageUrl,
    pageTitle,
    seenUrls,
    totalItems,
    maxItems: MAX_ITEMS,
    nextId: genId,
  })
  totalItems = videoResult.totalItems
  return [...imageResult.newItems, ...videoResult.newItems]
}

async function doScan(): Promise<void> {
  if (state === 'importing') return
  state = 'scanning'
  const newItems = await scanPage()
  if (newItems.length > 0) {
    items.push(...newItems)
    renderNewItems(newItems)
  }
  updateStats()
}

function startPeriodic(): void {
  stopPeriodic()
  state = 'scanning'
  scanTimer = window.setInterval(() => { void doScan() }, SCAN_INTERVAL_MS)
}

function stopPeriodic(): void {
  if (scanTimer) { clearInterval(scanTimer); scanTimer = null }
  lazyScroll.pause()
  if (state !== 'importing') state = 'idle'
}

function attachScrollWatch(): void {
  detachScrollWatch()
  scrollWatchCleanup = startBoardSaverScrollWatch(() => {
    if (!mounted || state === 'importing') return
    void doScan()
  })
}

function detachScrollWatch(): void {
  scrollWatchCleanup?.()
  scrollWatchCleanup = null
}

/* ------------------------------------------------------------------ */
/*  Grid / rendering                                                     */
/* ------------------------------------------------------------------ */

function renderCard(item: BoardSaverItem): HTMLElement {
  return createBoardSaverCard(item, {
    searchKeyword,
    onToggleSelect: () => updateStats(),
  })
}

function renderNewItems(newItems: BoardSaverItem[]): void {
  appendBoardSaverCards(el('bs-grid'), newItems.map(renderCard))
  applyFilters()
}

function applySizeSort(): void {
  applyBoardSaverSizeSort(el('bs-grid'), items, sortBySize)
}

function syncCardSelection(): void {
  syncBoardSaverCardSelection(el('bs-grid'), items)
}

function applyFilters(): void {
  const visible = applyBoardSaverFilters(el('bs-grid'), items, currentFilterCriteria(), searchKeyword)
  el<HTMLElement>('bs-status-text').textContent = `显示 ${visible}/${items.length} 项`
}

function updateStats(): void {
  const total = items.length, sel = items.filter(i => i.selected).length
  el<HTMLElement>('bs-count-text').textContent = `${sel}/${total}`
  const btn = el<HTMLButtonElement>('bs-import-selected')
  btn.textContent = sel ? `保存选中 (${sel})` : '保存选中'
  updateFilterSidebar()
}

/* ------------------------------------------------------------------ */
/*  Filter sidebar                                                       */
/* ------------------------------------------------------------------ */

function updateFilterSidebar(): void {
  updateBoardSaverFilterSidebar(
    items,
    { size: setFilterSize, format: setFilterFormat, domain: setFilterDomain },
    {
      onSizeChange: (v) => { setFilterSize = v },
      onFormatChange: (v) => { setFilterFormat = v },
      onDomainChange: (v) => { setFilterDomain = v },
      onFilterApplied: () => { applyFilters(); updateFilterSidebar() },
      onPersist: () => { void saveSettings() },
    },
  )
}

/* ------------------------------------------------------------------ */
/*  Download                                                             */
/* ------------------------------------------------------------------ */

function resumeScanAfterImport(hadPeriodicTimer: boolean): void {
  const action = resolvePostImportAction({
    pageType,
    scrollComplete,
    hadPeriodicTimer,
  })
  switch (action.type) {
    case 'resume-periodic':
      startPeriodic()
      break
    case 'resume-lazy-scroll':
      state = 'scanning'
      void startScrollScan()
      break
    case 'idle':
      state = 'idle'
      break
  }
}

async function importSelected(): Promise<void> {
  const selected = items.filter((i) => i.selected)
  if (!selected.length) {
    showToast('请至少选择一项')
    return
  }
  const imageItems = selected.filter((i) => i.kind !== 'video_page')
  const videoItems = selected.filter((i) => i.kind === 'video_page')
  const hadPeriodicTimer = scanTimer !== null
  stopPeriodic()
  state = 'importing'
  setButtonsDisabled(true)

  const finishImport = (statusText: string, isError = false): void => {
    setStatus(statusText)
    if (isError) showToast(statusText)
    resumeScanAfterImport(hadPeriodicTimer)
    setButtonsDisabled(false)
  }

  const summaries: string[] = []
  let historyCount = 0

  if (videoItems.length > 0) {
    setStatus(`正在提交 ${videoItems.length} 个视频作品…`)
    const videoResult = await runBoardSaverVideoPageImport(
      videoItems.map((item) => ({
        url: item.url,
        platform: item.platform,
        pageTitle,
      })),
    )
    if (!videoResult.ok) {
      finishImport(`视频导入失败: ${videoResult.error}`, true)
      return
    }
    const videoSummary = `视频作品：成功 ${videoResult.succeeded}，失败 ${videoResult.failed}`
    summaries.push(videoSummary)
    historyCount += videoResult.succeeded
  }

  if (imageItems.length > 0) {
    setStatus(`正在导入 ${imageItems.length} 张图片…`)
    const result = await runBoardSaverBatchImport(
      imageItems.map((item) => ({
        url: item.url,
        filename: item.filename,
        referer: item.domain ? pageUrl : undefined,
      })),
      pageUrl,
      {
        onProgress: (count, total) => setStatus(`正在导入图片 ${count}/${total}…`),
        onRetry: (retry, maxRetries) => setStatus(`请求超时，重试 ${retry}/${maxRetries}…`),
      },
    )

    if (!result.ok && !hasImportedAssets(result.aggregate)) {
      finishImport(`图片导入出错: ${result.error}`, true)
      return
    }

    let imageSummary = formatImportSummary(result.aggregate)
    if (!result.ok) {
      imageSummary += `（后续批次失败: ${result.error}）`
    }
    summaries.push(imageSummary)
    historyCount += result.aggregate.imported

    if (result.aggregate.skippedUrls.length > 0 || result.aggregate.errorUrls.length > 0) {
      showSkippedList(result.aggregate.skippedUrls, result.aggregate.errorUrls)
    }
  }

  const summary = summaries.join(' · ') || '导入完成'
  setStatus(summary)
  showToast(summary)
  if (historyCount > 0) {
    await appendBoardSaverHistory({ pageUrl, pageTitle, count: historyCount, time: Date.now() })
  }
  finishImport(summary)
}

function showSkippedList(skippedUrls: string[], errorUrls: string[]): void {
  renderImportSummaryPanel(el('bs-grid'), skippedUrls, errorUrls, () => showToast('已复制'))
}

function setButtonsDisabled(disabled: boolean): void {
  for (const id of ['bs-import-selected', 'bs-close-btn', 'bs-select-all', 'bs-deselect-all']) {
    const btn = document.getElementById(id) as HTMLButtonElement | null; if (btn) btn.disabled = disabled
  }
}

function setStatus(text: string): void { el<HTMLElement>('bs-status-text').textContent = text }
function showToast(text: string): void { showBoardSaverToast(el('bs-toast'), text) }

async function loadHistory(): Promise<void> {
  renderBoardSaverHistoryPanel(await readBoardSaverHistory())
}

async function clearHistory(): Promise<void> {
  await clearBoardSaverHistory()
  renderBoardSaverHistoryPanel([])
}

const boardSaverHost: BoardSaverHost = {
  items,
  getEditMode: () => editMode,
  setEditMode: (value) => { editMode = value },
  getQuickSaveMode: () => quickSaveMode,
  setQuickSaveMode: (value) => { quickSaveMode = value },
  getSortBySize: () => sortBySize,
  setSortBySize: (value) => { sortBySize = value },
  getHideLowQuality: () => hideLowQuality,
  setHideLowQuality: (value) => { hideLowQuality = value },
  setSearchKeyword: (value) => { searchKeyword = value },
  getPageType: () => pageType,
  getItemCount: () => items.length,
  quickSaveClickHandler,
  editContext,
  close: () => unmountBoardSaver(boardSaverHost),
  importSelected,
  syncCardSelection,
  updateStats,
  applyFilters,
  updateFilterSidebar,
  applySizeSort,
  saveSettings,
  clearHistory,
  setStatus,
  isMounted: () => mounted,
  setMounted: (value) => { mounted = value },
  resetIdCounter: () => { idCounter.value = 0 },
  setPageInfo: (url, title) => { pageUrl = url; pageTitle = title },
  getOverlay: () => overlayEl,
  setOverlay: (el) => { overlayEl = el },
  buildPanel: () => createBoardSaverPanelRoot(),
  loadHistory,
  loadSettings,
  applyPersistedUiState: () => {
    if (sortBySize) {
      el('bs-sort-size').classList.add('active')
      el('bs-sort-size').textContent = '尺寸↓✓'
    }
    if (hideLowQuality) {
      el('bs-hide-low-qty').classList.add('active')
      el('bs-hide-low-qty').textContent = '质量✓'
    }
  },
  doScan,
  startPageDetection,
  attachScrollWatch,
  teardownScan: () => {
    stopPageDetection()
    stopPeriodic()
    lazyScroll.stop()
    detachScrollWatch()
  },
  resetCollectionState: () => {
    items.length = 0
    seenUrls.clear()
    totalItems = 0
    state = 'idle'
  },
}

/* ------------------------------------------------------------------ */
/*  Public API                                                          */
/* ------------------------------------------------------------------ */

export function openBoardSaver(): void { mountBoardSaver(boardSaverHost) }
export function closeBoardSaver(): void { unmountBoardSaver(boardSaverHost) }
