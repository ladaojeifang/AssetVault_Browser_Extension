/**
 * Board Saver — Eagle-style batch collector
 * Direct DOM injection (no iframe), runs in content script context.
 * Scans page images, renders floating right-side panel with filters & download.
 */

import { collectPageImageCandidates, mergeImageCandidates } from '../shared/page-image-scanner'
import { runMatchingAdapters } from '../shared/site-adapters/index'
import { filenameFromUrl } from '../shared/collect-meta-core'
import { enlargeImageUrl } from '../shared/url-enlarger'
import { type BoardSaverItem, SCAN_INTERVAL_MS, MAX_ITEMS } from './board-saver-types'
import {
  type PageType,
  resolvePostImportAction,
} from './board-saver-scan-state'

/* ------------------------------------------------------------------ */
/*  Constants                                                            */
/* ------------------------------------------------------------------ */

const ROOT_ID = 'assetvault-board-saver-overlay'

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

let setFilterSize = 'all'
let setFilterFormat = 'all'
let setFilterDomain = 'all'
let searchKeyword = ''

let itemIdCounter = 0
function genId(): string { return `bs-${++itemIdCounter}-${Date.now()}` }
function el<T extends HTMLElement>(id: string): T { return document.getElementById(id) as T }
function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

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
        if (!(node instanceof HTMLElement)) continue
        if (node.tagName === 'IMG' || node.tagName === 'VIDEO' || node.tagName === 'PICTURE' ||
            node.querySelector('img, video, picture')) {
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
    const ratio = sh / Math.max(vh, 1)

    if (domChangeCount < 3 && ratio < 1.3) {
      pageType = 'static'
      setStatus(`✅ 已采集全部 ${items.length} 项`)
    } else if (domChangeCount < 3 && ratio >= 1.3) {
      pageType = 'lazy'
      setStatus(`🔍 懒加载页面 — 自动滚动中… 已采集 ${items.length} 项`)
      startScrollScan()
    } else {
      pageType = 'waterfall'
      if (!scanTimer) startPeriodic()
      setStatus(`🔄 持续检测中… ${items.length} 项 | 滚动加载更多`)
    }
  }, 2000)
}

/** Auto-scroll page to trigger lazy‑loaded images, scanning incrementally. */
async function startScrollScan(): Promise<void> {
  if (pageType !== 'lazy' || scrollComplete || state === 'importing') return
  state = 'scanning'

  const origSh = document.documentElement.scrollHeight
  const step = Math.max(window.innerHeight * 0.8, 400)
  let currentY = window.scrollY || window.pageYOffset

  for (let attempt = 0; attempt < 25; attempt++) {
    // Scroll down a step
    currentY += step
    window.scrollTo({ top: currentY, behavior: 'smooth' })

    // Wait for lazy images to load / DOM to settle
    await new Promise(r => setTimeout(r, 600))

    // Scan new images
    await doScan()
    setStatus(`🔍 自动滚动… ${Math.round((currentY / Math.max(origSh, 1)) * 100)}% | ${items.length} 项`)

    // Check if we've reached the bottom
    const newSh = document.documentElement.scrollHeight
    const bottom = window.scrollY + window.innerHeight
    if (bottom >= newSh - 100) {
      scrollComplete = true
      setStatus(`✅ 已采集全部 ${items.length} 项`)
      return
    }
  }

  // Max scrolls reached — fall into periodic scanning for remaining waterfall content
  scrollComplete = true
  startPeriodic()
  setStatus(`🔄 持续检测中… ${items.length} 项 | 已到达预扫描底部`)
}

function stopPageDetection(): void {
  if (detectObserver) { detectObserver.disconnect(); detectObserver = null }
  scrollComplete = true
  pageType = 'unknown'
}

async function scanPage(): Promise<BoardSaverItem[]> {
  const candidates = collectPageImageCandidates(pageUrl, pageTitle)
  let merged = mergeImageCandidates(candidates)
  const adapterResults = runMatchingAdapters(pageUrl, pageTitle)
  for (const a of adapterResults) {
    if (a.kind === 'gif' || /\.(jpg|jpeg|png|webp|avif|bmp|svg)(\?|#|$)/i.test(a.url)) {
      merged.push({ url: a.url, source: `adapter-${a.site}`, score: a.confidence, width: undefined, height: undefined })
    }
  }

  // ── Universal deep scan: background-image + best srcset (Eagle parity) ──
  const bgSeen = new Set(merged.map(c => c.url))
  for (const el of Array.from(document.querySelectorAll('body, body *'))) {
    if (!(el instanceof HTMLElement)) continue
    try {
      const bg = getComputedStyle(el).backgroundImage
      if (!bg || bg === 'none') continue
      const m = bg.match(/url\(["']?([^"')]+)["']?\)/)
      if (!m?.[1] || /^data:/i.test(m[1]) || m[1].startsWith('blob:') || /gradient/i.test(bg)) continue
      // resolve relative URLs
      let abs = m[1]
      try { abs = new URL(abs, pageUrl).href } catch { /* keep raw */ }
      if (!bgSeen.has(abs) && /^https?:\/\//.test(abs)) {
        bgSeen.add(abs)
        merged.push({ url: abs, source: 'background', score: 0.55, width: undefined, height: undefined })
      }
    } catch { /* ignore */ }
  }

  // ── Pick best srcset URL for all <img> elements ──
  for (const img of Array.from(document.querySelectorAll('img[srcset]'))) {
    if (!(img instanceof HTMLImageElement)) continue
    const srcset = img.getAttribute('srcset')
    if (!srcset) continue
    let bestUrl = ''
    let bestW = 0
    for (const part of srcset.split(',')) {
      const m = part.trim().match(/^(\S+)\s+(\d+)w\b/i)
      if (m) {
        const w = Number(m[2])
        if (w > bestW) { bestW = w; bestUrl = m[1] }
        continue
      }
      const bare = part.trim().split(/\s+/)[0]
      if (bare.startsWith('http') && !bestUrl) bestUrl = bare
    }
    if (bestUrl) {
      try { bestUrl = new URL(bestUrl, pageUrl).href } catch { /* */ }
      if (/^https?:\/\//.test(bestUrl) && !bgSeen.has(bestUrl)) {
        bgSeen.add(bestUrl)
        merged.push({ url: bestUrl, source: 'srcset-best', score: 0.8, width: img.naturalWidth || undefined, height: img.naturalHeight || undefined })
      }
    }
  }

  // ── Twitter/X: force-collect all twimg media images ──
  if (/x\.com|twitter\.com/i.test(location.hostname)) {
    const twSelectors = [
      '[data-testid="tweetPhoto"] img',
      'img[src*="pbs.twimg.com/media"]',
      'img[src*="twimg.com/media"]',
      'article img[src*="/media/"]',
    ]
    for (const sel of twSelectors) {
      for (const img of Array.from(document.querySelectorAll(sel))) {
        if (!(img instanceof HTMLImageElement)) continue
        const src = img.currentSrc || img.src
        if (!src || !/twimg\.com\/media\//i.test(src)) continue
        if (!bgSeen.has(src)) {
          bgSeen.add(src)
          merged.push({ url: src, source: 'twitter-media', score: 0.85, width: undefined, height: undefined })
        }
      }
    }
  }

  merged = mergeImageCandidates(merged)

  // Enlarge URLs to HD in parallel batches (concurrency=6)
  const HD_CONCURRENCY = 6
  const hdMap = new Map<string, string>()
  for (let i = 0; i < merged.length; i += HD_CONCURRENCY) {
    const chunk = merged.slice(i, i + HD_CONCURRENCY)
    const results = await Promise.all(chunk.map(async (c) => {
      try {
        const hdUrl = await enlargeImageUrl(c.url)
        return { orig: c.url, hd: hdUrl }
      } catch {
        return { orig: c.url, hd: c.url }
      }
    }))
    for (const r of results) hdMap.set(r.orig, r.hd)
  }

  const newItems: BoardSaverItem[] = []
  for (const c of merged) {
    const hdUrl = hdMap.get(c.url) || c.url
    if (seenUrls.has(hdUrl)) continue
    if (totalItems + newItems.length >= MAX_ITEMS) break
    seenUrls.add(hdUrl)
    totalItems++
    newItems.push({
      id: genId(), url: hdUrl, filename: filenameFromUrl(hdUrl),
      domain: extractDomain(hdUrl), width: c.width, height: c.height,
      selected: true, discoveredAt: Date.now(), source: c.source,
    })
  }
  return newItems
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
  if (state !== 'importing') state = 'idle'
}

/* ------------------------------------------------------------------ */
/*  Filter helpers                                                       */
/* ------------------------------------------------------------------ */

function getSizeCat(item: BoardSaverItem): string {
  const dim = Math.max(item.width ?? 0, item.height ?? 0)
  if (!dim) return 'unknown'
  if (dim < 500) return 'small'; if (dim < 1000) return 'medium'
  if (dim < 2000) return 'large'; return 'hd'
}

function getFmt(item: BoardSaverItem): string {
  try { return (new URL(item.url).pathname.split('.').pop() || '').toLowerCase().split(/[?#]/)[0] } catch { return '' }
}

function matchesFilter(item: BoardSaverItem): boolean {
  if (setFilterSize !== 'all' && getSizeCat(item) !== setFilterSize) return false
  if (setFilterFormat !== 'all' && getFmt(item) !== setFilterFormat) return false
  if (setFilterDomain !== 'all' && item.domain !== setFilterDomain) return false
  if (searchKeyword) {
    const kw = searchKeyword.toLowerCase()
    if (!(item.filename ?? '').toLowerCase().includes(kw) && !item.url.toLowerCase().includes(kw)) return false
  }
  return true
}

/* ------------------------------------------------------------------ */
/*  Rendering                                                            */
/* ------------------------------------------------------------------ */

function renderCard(item: BoardSaverItem): HTMLElement {
  const card = document.createElement('article')
  card.className = `bs-card${item.selected ? ' selected' : ''}`
  card.dataset.id = item.id

  // Check overlay SVG
  const check = document.createElement('div')
  check.className = 'bs-check'
  check.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="white"/><circle cx="12" cy="12" r="12" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 12l4 4 6-8" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  card.appendChild(check)

  const thumb = document.createElement('div')
  thumb.className = 'bs-thumb-wrap'
  const img = document.createElement('img')
  img.src = item.url; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'
  img.onerror = () => {
    if (img.dataset.fallback === '1') return; img.dataset.fallback = '1'
    img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIGZpbGw9Im5vbmUiPjxyZWN0IHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgZmlsbD0iI2YwZjBmMCIvPjwvc3ZnPg=='
    img.style.padding = '20px'; img.style.objectFit = 'none'
  }
  thumb.appendChild(img); card.appendChild(thumb)

  const info = document.createElement('div'); info.className = 'bs-info'
  const fn = document.createElement('div'); fn.className = 'bs-filename'
  fn.textContent = item.filename || item.url.split('/').pop() || ''
  const meta = document.createElement('div'); meta.className = 'bs-meta-line'
  const dim = item.width && item.height ? `${item.width}×${item.height}` : ''
  meta.textContent = [dim, getFmt(item).toUpperCase()].filter(Boolean).join(' / ')
  info.append(fn, meta); card.appendChild(info)

  card.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a, button')) return
    item.selected = !item.selected
    card.classList.toggle('selected', item.selected)
    updateStats()
  })
  return card
}

function renderNewItems(newItems: BoardSaverItem[]): void {
  const grid = el<HTMLElement>('bs-grid')
  const empty = grid.querySelector('.bs-empty-hint')
  if (empty) empty.remove()
  const frag = document.createDocumentFragment()
  for (const it of newItems) frag.appendChild(renderCard(it))
  grid.appendChild(frag)
  applyFilters()
}

function syncCardSelection(): void {
  const grid = el<HTMLElement>('bs-grid')
  for (const it of items) {
    const c = grid.querySelector(`[data-id="${CSS.escape(it.id)}"]`) as HTMLElement | null
    if (c) c.classList.toggle('selected', it.selected)
  }
}

function applyFilters(): void {
  const grid = el<HTMLElement>('bs-grid')
  let visible = 0
  for (const it of items) {
    const c = grid.querySelector(`[data-id="${CSS.escape(it.id)}"]`) as HTMLElement | null
    if (!c) continue
    const show = matchesFilter(it)
    c.style.display = show ? '' : 'none'
    if (show) visible++
  }
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

function buildFilterRow(cid: string, opts: Array<{ value: string; label: string; count: number }>, active: string, onChange: (v: string) => void): void {
  const container = document.getElementById(cid); if (!container) return
  container.innerHTML = ''
  for (const o of opts) {
    const row = document.createElement('div')
    row.className = `bs-filter-item${active === o.value ? ' active' : ''}`
    row.innerHTML = `<span>${o.label}</span><span class="bs-filter-count">${o.count}</span>`
    row.addEventListener('click', () => { onChange(o.value); applyFilters(); updateFilterSidebar() })
    container.appendChild(row)
  }
}

function updateFilterSidebar(): void {
  const sizes: Record<string, number> = { all: items.length, small: 0, medium: 0, large: 0, hd: 0, unknown: 0 }
  const formats: Record<string, number> = { all: items.length }
  const domains: Record<string, number> = { all: items.length }

  for (const it of items) {
    sizes[getSizeCat(it)] = (sizes[getSizeCat(it)] || 0) + 1
    const f = getFmt(it) || 'other'; formats[f] = (formats[f] || 0) + 1
    if (it.domain) domains[it.domain] = (domains[it.domain] || 0) + 1
  }

  buildFilterRow('bs-filter-size', [
    { value: 'all', label: '全部', count: sizes.all }, { value: 'small', label: '小 (<500px)', count: sizes.small },
    { value: 'medium', label: '中 (500-999)', count: sizes.medium }, { value: 'large', label: '大 (1000-1999)', count: sizes.large },
    { value: 'hd', label: 'HD (≥2000)', count: sizes.hd },
  ], setFilterSize, v => { setFilterSize = v })

  const fmtOpts = Object.entries(formats).filter(([k]) => k !== 'all').sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([k, v]) => ({ value: k, label: `.${k}`, count: v }))
  buildFilterRow('bs-filter-format', [{ value: 'all', label: '全部', count: formats.all }, ...fmtOpts], setFilterFormat, v => { setFilterFormat = v })

  const domOpts = Object.entries(domains).filter(([k]) => k !== 'all').sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([k, v]) => ({ value: k, label: k, count: v }))
  buildFilterRow('bs-filter-domain', [{ value: 'all', label: '全部', count: domains.all }, ...domOpts], setFilterDomain, v => { setFilterDomain = v })
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
  const selected = items.filter(i => i.selected)
  if (!selected.length) { showToast('请至少选择一项'); return }
  const hadPeriodicTimer = scanTimer !== null
  stopPeriodic()
  state = 'importing'
  setButtonsDisabled(true)
  setStatus(`正在导入 ${selected.length} 项…`)

  const BATCH = 10
  let totalDone = 0
  const MAX_RETRIES = 2
  for (let i = 0; i < selected.length; i += BATCH) {
    const batch = selected.slice(i, i + BATCH)
    const count = Math.min(i + BATCH, selected.length)
    setStatus(`正在导入 ${count}/${selected.length} 项…`)

    let retries = 0
    let ok = false
    while (retries <= MAX_RETRIES) {
      try {
        const resp = await chrome.runtime.sendMessage({
          type: 'IMPORT_BATCH',
          items: batch.map(item => ({ url: item.url, filename: item.filename, headers: item.domain ? { Referer: pageUrl } : undefined })),
          sourceUrl: pageUrl,
        })
        if (resp?.ok) {
          ok = true
          totalDone += batch.length
          console.log(`[BoardSaver] batch done: ${totalDone}/${selected.length}`)
          break
        }
        // Non-timeout error: don't retry
        if (!String(resp?.error ?? '').includes('超时')) {
          setStatus(`导入出错: ${resp?.error ?? '未知错误'}`); state = 'idle'; setButtonsDisabled(false); return
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!msg.includes('超时') && !msg.includes('Receiving end')) {
          setStatus(`导入出错: ${msg}`); state = 'idle'; setButtonsDisabled(false); return
        }
      }
      retries++
      if (retries <= MAX_RETRIES) {
        setStatus(`请求超时，重试 ${retries}/${MAX_RETRIES}…`)
        await new Promise(r => setTimeout(r, 2000))
      }
    }
    if (!ok) {
      setStatus(`导入中断: 连续超时 (${count}/${selected.length})`)
      state = 'idle'; setButtonsDisabled(false); return
    }
  }

  setStatus(`完成！共 ${selected.length} 项`)
  showToast(`已提交 ${selected.length} 项`)
  resumeScanAfterImport(hadPeriodicTimer)
  setButtonsDisabled(false)
}

function setButtonsDisabled(disabled: boolean): void {
  for (const id of ['bs-import-selected', 'bs-close-btn', 'bs-select-all', 'bs-deselect-all']) {
    const btn = document.getElementById(id) as HTMLButtonElement | null; if (btn) btn.disabled = disabled
  }
}

function setStatus(text: string): void { el<HTMLElement>('bs-status-text').textContent = text }
function showToast(text: string): void {
  const t = el<HTMLElement>('bs-toast'); t.textContent = text; t.classList.add('visible')
  const timer = (t as any)._t; if (timer) clearTimeout(timer)
  ;(t as any)._t = setTimeout(() => t.classList.remove('visible'), 2800)
}

/* ------------------------------------------------------------------ */
/*  DOM construction                                                     */
/* ------------------------------------------------------------------ */

function buildPanel(): HTMLElement {
  const root = document.createElement('div')
  root.id = ROOT_ID
  root.innerHTML = `
    <div class="bs-backdrop"></div>
    <div class="bs-panel" id="bs-panel">
      <div class="bs-header">
        <span class="bs-header-title">批量收藏</span>
        <input class="bs-search" id="bs-search" type="text" placeholder="搜索文件名…" spellcheck="false" />
        <button class="bs-tool-btn" id="bs-select-all" type="button">全选</button>
        <button class="bs-tool-btn" id="bs-deselect-all" type="button">全不选</button>
        <span class="bs-count" id="bs-count-text">0/0</span>
        <button class="bs-tool-btn bs-close-btn" id="bs-close-btn" type="button">✕</button>
      </div>
      <div class="bs-body">
        <div class="bs-grid-wrap" id="bs-grid-wrap">
          <div class="bs-grid" id="bs-grid"><p class="bs-empty-hint">正在扫描图片…</p></div>
        </div>
        <div class="bs-filter-sidebar">
          <div class="bs-filter-section"><h4>尺寸</h4><div id="bs-filter-size"></div></div>
          <div class="bs-filter-section"><h4>格式</h4><div id="bs-filter-format"></div></div>
          <div class="bs-filter-section"><h4>域名</h4><div id="bs-filter-domain"></div></div>
        </div>
      </div>
      <div class="bs-footer">
        <span class="bs-footer-status" id="bs-status-text">就绪</span>
        <button class="bs-save-btn" id="bs-import-selected" type="button">保存选中</button>
      </div>
      <div class="bs-toast" id="bs-toast"></div>
    </div>
  `
  return root
}

function bindEvents(): void {
  el('bs-close-btn').addEventListener('click', closeBoardSaver)
  el('bs-import-selected').addEventListener('click', () => void importSelected())
  el('bs-select-all').addEventListener('click', () => { for (const it of items) it.selected = true; syncCardSelection(); updateStats() })
  el('bs-deselect-all').addEventListener('click', () => { for (const it of items) it.selected = false; syncCardSelection(); updateStats() })

  let debounce: ReturnType<typeof setTimeout> | undefined
  el<HTMLInputElement>('bs-search').addEventListener('input', () => {
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(() => { searchKeyword = el<HTMLInputElement>('bs-search').value.trim().toLowerCase(); applyFilters(); updateStats(); updateFilterSidebar() }, 250)
  })

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeBoardSaver() })

  // Backdrop click to close
  const backdrop = document.querySelector(`#${ROOT_ID} .bs-backdrop`) as HTMLElement
  if (backdrop) backdrop.addEventListener('click', closeBoardSaver)
}

/* ------------------------------------------------------------------ */
/*  Mount / Unmount                                                      */
/* ------------------------------------------------------------------ */

function mount(): void {
  if (mounted) return
  mounted = true
  pageUrl = location.href
  pageTitle = document.title
  itemIdCounter = 0

  // Inject CSS
  if (!document.querySelector('link[href*="board-saver-bridge.css"]')) {
    const cssLink = document.createElement('link')
    cssLink.rel = 'stylesheet'
    cssLink.href = chrome.runtime.getURL('board-saver-bridge.css')
    document.head.appendChild(cssLink)
  }

  overlayEl = buildPanel()
  document.body.appendChild(overlayEl)
  bindEvents()

  // Step 1: immediate first scan (show results right away)
  setStatus('🔍 正在分析页面…')
  void doScan().then(() => {
    // Step 2: start 2-second page type detection
    startPageDetection()
    // Force a re-scan after detection window (catches late-loaded images on static pages)
    setTimeout(() => {
      if (pageType === 'static') {
        void doScan().then(() => setStatus(`✅ 已采集全部 ${items.length} 项`))
      }
    }, 2500)
  })
}

function unmount(): void {
  if (!mounted) return
  stopPageDetection()
  stopPeriodic()
  items.length = 0
  seenUrls.clear()
  totalItems = 0
  state = 'idle'
  if (overlayEl) { overlayEl.remove(); overlayEl = null }
  mounted = false
}

/* ------------------------------------------------------------------ */
/*  Public API                                                          */
/* ------------------------------------------------------------------ */

export function openBoardSaver(): void { mount() }
export function closeBoardSaver(): void { unmount() }
