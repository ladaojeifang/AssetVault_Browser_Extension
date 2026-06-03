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
let quickSaveMode = false
let sortBySize = false
let hideLowQuality = false
let editMode = false
const editedFilenames = new Map<string, string>()

/* ------------------------------------------------------------------ */
/*  Panel settings persistence                                           */
/* ------------------------------------------------------------------ */

const SETTINGS_KEY = 'assetvaultBoardSaverSettings'

type PanelSettings = {
  filterSize: string
  filterFormat: string
  filterDomain: string
  sortBySize: boolean
  hideLowQuality: boolean
}

async function saveSettings(): Promise<void> {
  const s: PanelSettings = {
    filterSize: setFilterSize,
    filterFormat: setFilterFormat,
    filterDomain: setFilterDomain,
    sortBySize,
    hideLowQuality,
  }
  await chrome.storage.local.set({ [SETTINGS_KEY]: s })
}

async function loadSettings(): Promise<void> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY)
  const s = stored[SETTINGS_KEY] as PanelSettings | undefined
  if (!s) return
  if (s.filterSize) setFilterSize = s.filterSize
  if (s.filterFormat) setFilterFormat = s.filterFormat
  if (s.filterDomain) setFilterDomain = s.filterDomain
  if (s.sortBySize !== undefined) sortBySize = s.sortBySize
  if (s.hideLowQuality !== undefined) hideLowQuality = s.hideLowQuality
}

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

  // ── Instagram: extract carousel images from page data ──
  if (/instagram\.com/i.test(location.hostname)) {
    const igUrls = new Set<string>()
    for (const s of Array.from(document.querySelectorAll('script'))) {
      const txt = s.textContent || ''
      if (!txt.includes('display_url') && !txt.includes('carousel_media')) continue
      // Match Instagram CDN image URLs from JSON data
      const cdnRe = /https?:\/\/(?:[^/]*\.)?(?:cdninstagram\.com|fbcdn\.net)[^"'\s\\]+?\.(?:jpg|jpeg|png|webp)(\?[^\s"'\\]*)?/gi
      for (const hit of txt.match(cdnRe) || []) {
        try { igUrls.add(new URL(hit).origin + new URL(hit).pathname.split('?')[0]) } catch { igUrls.add(hit) }
      }
    }
    for (const url of igUrls) {
      if (!bgSeen.has(url) && url.length < 2000) {
        bgSeen.add(url)
        merged.push({ url, source: 'instagram-data', score: 0.82, width: undefined, height: undefined })
      }
    }
  }

  // ── SVG inline collection ──
  for (const svg of Array.from(document.querySelectorAll('svg'))) {
    try {
      // Skip tiny/decorative SVGs
      const rect = svg.getBoundingClientRect()
      if (rect.width < 16 && rect.height < 16) continue
      // Serialize to string and encode as data URI
      const clone = svg.cloneNode(true) as SVGElement
      const xml = new XMLSerializer().serializeToString(clone)
      const dataUri = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)))
      if (dataUri.length > 500000) continue // Skip huge SVGs (>500KB)
      if (!bgSeen.has(dataUri)) {
        bgSeen.add(dataUri)
        merged.push({ url: dataUri, source: 'svg-inline', score: 0.6, width: Math.round(rect.width), height: Math.round(rect.height) })
      }
    } catch { /* ignore */ }
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
    const isEnlarged = hdUrl !== c.url
    newItems.push({
      id: genId(), url: hdUrl, filename: filenameFromUrl(hdUrl),
      domain: extractDomain(hdUrl), width: c.width, height: c.height,
      selected: true, discoveredAt: Date.now(), source: c.source,
      isEnlarged,
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
  if (hideLowQuality && isLowQuality(item)) return false
  return true
}

/* ------------------------------------------------------------------ */
/*  Rendering                                                            */
/* ------------------------------------------------------------------ */

function enterEditMode(): void {
  const btn = el<HTMLButtonElement>('bs-edit-preview')
  btn.textContent = '确认编辑'
  btn.style.background = '#10b981'
  el<HTMLButtonElement>('bs-import-selected').textContent = '直接保存'
  setStatus('编辑模式：改标题或批量加前缀/后缀')

  // Show batch rename inputs in header
  const header = document.querySelector('.bs-header') as HTMLElement
  if (header && !header.querySelector('.bs-rename-inputs')) {
    const div = document.createElement('div')
    div.className = 'bs-rename-inputs'
    div.innerHTML = `
      <input class="bs-rename-prefix" id="bs-rename-prefix" type="text" placeholder="前缀…" style="width:70px;padding:3px 6px;border:1px solid #e5e7eb;border-radius:4px;font-size:11px" />
      <span style="color:#9ca3af;font-size:11px">/</span>
      <input class="bs-rename-suffix" id="bs-rename-suffix" type="text" placeholder="后缀…" style="width:70px;padding:3px 6px;border:1px solid #e5e7eb;border-radius:4px;font-size:11px" />
      <button class="bs-tool-btn" id="bs-rename-apply" type="button" style="font-size:11px;padding:3px 8px">应用</button>
    `
    header.insertBefore(div, header.querySelector('.bs-search'))
    document.getElementById('bs-rename-apply')?.addEventListener('click', () => {
      applyBatchRename()
    })
  }

  const grid = el<HTMLElement>('bs-grid')
  for (const it of items) {
    const card = grid.querySelector(`[data-id="${CSS.escape(it.id)}"]`) as HTMLElement | null
    if (!card) continue
    const fnEl = card.querySelector('.bs-filename') as HTMLElement | null
    if (!fnEl) continue
    fnEl.contentEditable = 'true'
    fnEl.style.outline = '1px dashed #3b82f6'
    fnEl.style.padding = '0 2px'
    fnEl.style.borderRadius = '2px'
    fnEl.title = '点击编辑文件名'
    fnEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur() }
    })
  }
}

function applyBatchRename(): void {
  const prefix = (document.getElementById('bs-rename-prefix') as HTMLInputElement)?.value ?? ''
  const suffix = (document.getElementById('bs-rename-suffix') as HTMLInputElement)?.value ?? ''
  const selected = items.filter(i => i.selected)
  const target = selected.length > 0 ? selected : items
  for (const it of target) {
    const oldName = it.filename || it.url.split('/').pop() || ''
    const extIdx = oldName.lastIndexOf('.')
    const base = extIdx > 0 ? oldName.slice(0, extIdx) : oldName
    const ext = extIdx > 0 ? oldName.slice(extIdx) : ''
    it.filename = prefix + base + suffix + ext
    editedFilenames.set(it.id, it.filename)
  }
  // Update visible filename elements
  const grid = el<HTMLElement>('bs-grid')
  for (const it of target) {
    const card = grid.querySelector(`[data-id="${CSS.escape(it.id)}"]`) as HTMLElement | null
    if (!card) continue
    const fnEl = card.querySelector('.bs-filename') as HTMLElement | null
    if (fnEl) fnEl.textContent = it.filename || it.url.split('/').pop() || ''
  }
  // Clear inputs
  const prefixEl = document.getElementById('bs-rename-prefix') as HTMLInputElement
  const suffixEl = document.getElementById('bs-rename-suffix') as HTMLInputElement
  if (prefixEl) prefixEl.value = ''
  if (suffixEl) suffixEl.value = ''
  showToast(`已重命名 ${target.length} 项`)
}

function exitEditMode(save: boolean): void {
  editMode = false
  const btn = el<HTMLButtonElement>('bs-edit-preview')
  btn.textContent = '预览编辑'
  btn.style.background = '#6b7280'
  el<HTMLButtonElement>('bs-import-selected').textContent = '保存选中'

  // Remove rename inputs
  const renameDiv = document.querySelector('.bs-rename-inputs')
  if (renameDiv) renameDiv.remove()

  if (save) {
    const grid = el<HTMLElement>('bs-grid')
    for (const it of items) {
      const card = grid.querySelector(`[data-id="${CSS.escape(it.id)}"]`) as HTMLElement | null
      if (!card) continue
      const fnEl = card.querySelector('.bs-filename') as HTMLElement | null
      if (!fnEl) continue
      const edited = fnEl.textContent?.trim()
      if (edited && edited !== it.filename) {
        editedFilenames.set(it.id, edited)
        it.filename = edited
      }
      fnEl.contentEditable = 'false'
      fnEl.style.outline = ''
      fnEl.style.padding = ''
      fnEl.style.borderRadius = ''
      fnEl.title = ''
    }
  } else {
    const grid = el<HTMLElement>('bs-grid')
    for (const it of items) {
      const card = grid.querySelector(`[data-id="${CSS.escape(it.id)}"]`) as HTMLElement | null
      if (!card) continue
      const fnEl = card.querySelector('.bs-filename') as HTMLElement | null
      if (!fnEl) continue
      fnEl.contentEditable = 'false'
      fnEl.style.outline = ''
      fnEl.style.padding = ''
      fnEl.style.borderRadius = ''
      fnEl.title = ''
    }
  }
  setStatus('就绪')
}

function renderCard(item: BoardSaverItem): HTMLElement {
  const card = document.createElement('article')
  card.className = `bs-card${item.selected ? ' selected' : ''}`
  card.dataset.id = item.id

  // Check overlay SVG
  const check = document.createElement('div')
  check.className = 'bs-check'
  check.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="white"/><circle cx="12" cy="12" r="12" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 12l4 4 6-8" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  card.appendChild(check)

  // Source badge (HD / thumbnail)
  const badge = document.createElement('span')
  badge.className = `bs-badge${item.isEnlarged ? ' bs-badge-hd' : ' bs-badge-thumb'}`
  badge.textContent = item.isEnlarged ? 'HD' : '⬇缩略'
  card.appendChild(badge)

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
  const rawName = item.filename || item.url.split('/').pop() || ''
  // Highlight search keyword matches
  if (searchKeyword) {
    const idx = rawName.toLowerCase().indexOf(searchKeyword)
    if (idx >= 0) {
      fn.innerHTML = `${rawName.slice(0, idx)}<mark class="bs-highlight">${rawName.slice(idx, idx + searchKeyword.length)}</mark>${rawName.slice(idx + searchKeyword.length)}`
    } else {
      fn.textContent = rawName
    }
  } else {
    fn.textContent = rawName
  }
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

function isLowQuality(item: BoardSaverItem): boolean {
  const dim = Math.max(item.width ?? 0, item.height ?? 0)
  if (dim > 0 && dim < 64) return true
  if (/google-analytics|doubleclick|facebook\.com\/tr|bat\.bing|linkedin\.com\/li\/track/.test(item.url)) return true
  // Only match low-quality keywords in the filename portion (last URL segment)
  const filename = (item.url.split('/').pop() || '').toLowerCase()
  if (/\b(thumb|preview|mini|sprite|avatar|logo|badge|favicon|icon)(\.[a-z]+)?$/i.test(filename)) return true
  if (item.url.includes('placeholder') || item.url.includes('1x1')) return true
  return false
}

function applySizeSort(): void {
  const grid = el<HTMLElement>('bs-grid')
  const cards = Array.from(grid.children) as HTMLElement[]
  // Sort by pixel area desc, putting non-card elements (empty hints, summaries) at top
  cards.sort((a, b) => {
    const idA = (a as HTMLElement).dataset.id
    const idB = (b as HTMLElement).dataset.id
    if (!idA) return -1 // non-card goes first
    if (!idB) return 1
    const itemA = items.find(it => it.id === idA)
    const itemB = items.find(it => it.id === idB)
    if (!sortBySize || !itemA || !itemB) return 0
    const areaA = (itemA.width ?? 0) * (itemA.height ?? 0)
    const areaB = (itemB.width ?? 0) * (itemB.height ?? 0)
    return areaB - areaA
  })
  for (const c of cards) grid.appendChild(c)
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
    if (show) {
      visible++
      // Refresh search highlight in filename
      const fnEl = c.querySelector('.bs-filename')
      if (fnEl) {
        const rawName = it.filename || it.url.split('/').pop() || ''
        if (searchKeyword) {
          const idx = rawName.toLowerCase().indexOf(searchKeyword)
          if (idx >= 0) {
            fnEl.innerHTML = `${rawName.slice(0, idx)}<mark class="bs-highlight">${rawName.slice(idx, idx + searchKeyword.length)}</mark>${rawName.slice(idx + searchKeyword.length)}`
          } else {
            fnEl.textContent = rawName
          }
        } else {
          fnEl.textContent = rawName
        }
      }
    }
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
    row.addEventListener('click', () => { onChange(o.value); applyFilters(); updateFilterSidebar(); void saveSettings() })
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
  const finishImport = (statusText: string, isError = false): void => {
    setStatus(statusText)
    if (isError) showToast(statusText)
    resumeScanAfterImport(hadPeriodicTimer)
    setButtonsDisabled(false)
  }

  const BATCH = 10
  let totalDone = 0
  const MAX_RETRIES = 2
  const skippedUrls: string[] = []
  const errorUrls: string[] = []
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
          // Collect skipped/error URLs from batch response
          const batchResult = (resp as { batch?: { skipped?: Array<{url:string}>; errors?: Array<{url:string}>} }).batch
          if (batchResult) {
            for (const s of batchResult.skipped || []) skippedUrls.push(s.url)
            for (const e of batchResult.errors || []) errorUrls.push(e.url)
          }
          console.log(`[BoardSaver] batch done: ${totalDone}/${selected.length}`)
          break
        }
        if (!String(resp?.error ?? '').includes('超时')) {
          finishImport(`导入出错: ${resp?.error ?? '未知错误'}`, true)
          return
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!msg.includes('超时') && !msg.includes('Receiving end')) {
          finishImport(`导入出错: ${msg}`, true)
          return
        }
      }
      retries++
      if (retries <= MAX_RETRIES) {
        setStatus(`请求超时，重试 ${retries}/${MAX_RETRIES}…`)
        await new Promise(r => setTimeout(r, 2000))
      }
    }
    if (!ok) {
      finishImport(`导入中断: 连续超时 (${count}/${selected.length})`, true)
      return
    }
  }

  const totalSkipped = skippedUrls.length
  const totalErrors = errorUrls.length
  const imported = selected.length - totalSkipped - totalErrors
  let summary = `完成！成功 ${imported}`
  if (totalSkipped) summary += `，跳过 ${totalSkipped}`
  if (totalErrors) summary += `，失败 ${totalErrors}`
  setStatus(summary)
  showToast(summary)

  // Show failed list if any
  if (totalSkipped > 0 || totalErrors > 0) {
    showSkippedList(skippedUrls, errorUrls)
  }

  // Save history record
  saveHistoryRecord(selected.length)

  finishImport(summary)
}

function showSkippedList(skippedUrls: string[], errorUrls: string[]): void {
  const grid = el<HTMLElement>('bs-grid')
  const old = grid.querySelector('.bs-import-summary')
  if (old) old.remove()

  const node = document.createElement('div')
  node.className = 'bs-import-summary'
  let html = '<div class="bs-import-summary-title">导入详情</div>'
  if (skippedUrls.length) {
    html += `<details open><summary>跳过 (${skippedUrls.length})</summary>`
    for (const u of skippedUrls) html += `<div class="bs-import-url" title="${u}">${truncateUrl(u)}</div>`
    html += '</details>'
  }
  if (errorUrls.length) {
    html += `<details open><summary>失败 (${errorUrls.length})</summary>`
    for (const u of errorUrls) html += `<div class="bs-import-url" title="${u}">${truncateUrl(u)}</div>`
    html += '</details>'
  }
  html += `<button class="bs-tool-btn" style="margin-top:6px">复制全部</button>`
  node.innerHTML = html

  node.querySelector('button')?.addEventListener('click', () => {
    const all = [...skippedUrls, ...errorUrls].join('\n')
    void navigator.clipboard.writeText(all).then(() => showToast('已复制'))
  })

  grid.prepend(node)
}

function truncateUrl(url: string): string {
  return url.length > 80 ? url.slice(0, 78) + '…' : url
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
        <button class="bs-tool-btn bs-quick-save-btn" id="bs-quick-save" type="button" title="点击页面图片直接保存">⚡快采</button>
        <input class="bs-search" id="bs-search" type="text" placeholder="搜索文件名…" spellcheck="false" />
        <button class="bs-tool-btn" id="bs-select-all" type="button">全选</button>
        <button class="bs-tool-btn" id="bs-deselect-all" type="button">全不选</button>
        <button class="bs-tool-btn" id="bs-sort-size" type="button" title="按图片尺寸(像素)排序">尺寸↓</button>
        <button class="bs-tool-btn bs-quality-btn" id="bs-hide-low-qty" type="button" title="隐藏低质量图(缩略图/图标/追踪像素)">质量</button>
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
          <div class="bs-filter-section" id="bs-history-section" style="display:none">
            <h4>最近采集 <button class="bs-clear-history" id="bs-clear-history" title="清除历史">✕</button></h4>
            <div id="bs-history-list"></div>
          </div>
        </div>
      </div>
      <div class="bs-footer">
        <span class="bs-footer-status" id="bs-status-text">就绪</span>
        <button class="bs-save-btn" id="bs-edit-preview" type="button" style="background:#6b7280">预览编辑</button>
        <button class="bs-save-btn" id="bs-import-selected" type="button">保存选中</button>
      </div>
      <div class="bs-toast" id="bs-toast"></div>
    </div>
  `
  return root
}

function onQuickSaveClick(e: MouseEvent): void {
  if (!quickSaveMode) return
  const target = e.target as HTMLElement
  // Ignore clicks inside our own panel
  if (target.closest(`#${ROOT_ID}`)) return

  // Find the nearest clickable image
  let img = target as HTMLElement
  if (img.tagName !== 'IMG') {
    const closest = target.closest('img, video, [style*="background-image"]')
    if (closest) img = closest as HTMLElement
    else return
  }

  // Extract URL
  let url = ''
  if (img instanceof HTMLImageElement) {
    url = img.currentSrc || img.src
  } else if (img instanceof HTMLVideoElement) {
    url = img.currentSrc || img.src
  } else {
    const bg = getComputedStyle(img).backgroundImage
    const m = bg?.match(/url\(["']?([^"')]+)["']?\)/)
    if (m?.[1]) url = m[1]
  }
  if (!url || !/^https?:\/\//.test(url)) return

  // Save immediately
  e.preventDefault()
  e.stopPropagation()
  showToast('已保存')
  void chrome.runtime.sendMessage({
    type: 'IMPORT_META',
    meta: { url, pageUrl: location.href, pageTitle: document.title },
  }).catch(() => showToast('保存失败'))
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

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (editMode) { exitEditMode(false); return }
      if (quickSaveMode) { el('bs-quick-save').click(); return }
      closeBoardSaver()
    }
  })

  // ── Edit preview mode ──
  el('bs-edit-preview').addEventListener('click', () => {
    editMode = !editMode
    if (editMode) {
      enterEditMode()
    } else {
      exitEditMode(true)
    }
  })

  // ── Quality filter ──
  el('bs-hide-low-qty').addEventListener('click', () => {
    hideLowQuality = !hideLowQuality
    el('bs-hide-low-qty').classList.toggle('active', hideLowQuality)
    el('bs-hide-low-qty').textContent = hideLowQuality ? '质量✓' : '质量'
    applyFilters()
    updateStats()
    void saveSettings()
  })

  // ── Size sort ──
  el('bs-sort-size').addEventListener('click', () => {
    sortBySize = !sortBySize
    el('bs-sort-size').classList.toggle('active', sortBySize)
    el('bs-sort-size').textContent = sortBySize ? '尺寸↓✓' : '尺寸↓'
    applySizeSort()
    updateStats()
    void saveSettings()
  })

  // ── Quick save mode: click any image on the page to save ──
  el('bs-quick-save').addEventListener('click', () => {
    quickSaveMode = !quickSaveMode
    const btn = el('bs-quick-save')
    btn.textContent = quickSaveMode ? '⚡快采✓' : '⚡快采'
    btn.classList.toggle('active', quickSaveMode)
    if (quickSaveMode) {
      document.addEventListener('click', onQuickSaveClick, true)
      setStatus('快采模式：点击页面图片直接保存')
    } else {
      document.removeEventListener('click', onQuickSaveClick, true)
      setStatus('就绪')
    }
  })

  // Backdrop click to close
  const backdrop = document.querySelector(`#${ROOT_ID} .bs-backdrop`) as HTMLElement
  if (backdrop) backdrop.addEventListener('click', closeBoardSaver)

  // Clear history
  const clearBtn = document.getElementById('bs-clear-history')
  if (clearBtn) clearBtn.addEventListener('click', () => void clearHistory())
}

/* ------------------------------------------------------------------ */
/*  Import history                                                        */
/* ------------------------------------------------------------------ */

const HISTORY_KEY = 'assetvaultBoardSaverHistory'
const HISTORY_MAX = 10

type HistoryEntry = { pageUrl: string; pageTitle: string; count: number; time: number }

async function loadHistory(): Promise<void> {
  const stored = await chrome.storage.local.get(HISTORY_KEY)
  const entries: HistoryEntry[] = stored[HISTORY_KEY] || []
  if (!entries.length) return

  const section = document.getElementById('bs-history-section')
  if (section) section.style.display = ''
  const list = document.getElementById('bs-history-list')
  if (!list) return
  list.innerHTML = ''
  for (const e of entries.slice(0, HISTORY_MAX)) {
    const row = document.createElement('div')
    row.className = 'bs-history-item'
    row.title = e.pageUrl
    const timeStr = new Date(e.time).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    row.innerHTML = `<span class="bs-history-title">${e.pageTitle.slice(0, 20)}</span><span class="bs-history-meta">${e.count}张 ${timeStr}</span>`
    row.addEventListener('click', () => { window.open(e.pageUrl, '_blank') })
    list.appendChild(row)
  }
}

async function saveHistoryRecord(count: number): Promise<void> {
  const stored = await chrome.storage.local.get(HISTORY_KEY)
  const entries: HistoryEntry[] = stored[HISTORY_KEY] || []
  entries.unshift({ pageUrl, pageTitle, count, time: Date.now() })
  if (entries.length > HISTORY_MAX) entries.length = HISTORY_MAX
  await chrome.storage.local.set({ [HISTORY_KEY]: entries })
}

async function clearHistory(): Promise<void> {
  await chrome.storage.local.remove(HISTORY_KEY)
  const section = document.getElementById('bs-history-section')
  if (section) section.style.display = 'none'
  const list = document.getElementById('bs-history-list')
  if (list) list.innerHTML = ''
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
  void loadHistory()
  void loadSettings().then(() => {
    if (sortBySize) { el('bs-sort-size').classList.add('active'); el('bs-sort-size').textContent = '尺寸↓✓' }
    if (hideLowQuality) { el('bs-hide-low-qty').classList.add('active'); el('bs-hide-low-qty').textContent = '质量✓' }
  })

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
  if (quickSaveMode) {
    quickSaveMode = false
    document.removeEventListener('click', onQuickSaveClick, true)
  }
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
