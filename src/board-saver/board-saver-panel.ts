/** Board Saver panel DOM: shell HTML, cards, import summary. */

import type { BoardSaverItem } from './board-saver-types'
import { getFormatExt } from './board-saver-filters'
import { truncateImportUrl } from './board-saver-import'

export const BOARD_SAVER_ROOT_ID = 'assetvault-board-saver-overlay'

export function createBoardSaverPanelRoot(): HTMLElement {
  const root = document.createElement('div')
  root.id = BOARD_SAVER_ROOT_ID
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

export type BoardSaverCardOptions = {
  searchKeyword: string
  onToggleSelect: (item: BoardSaverItem) => void
}

export function createBoardSaverCard(item: BoardSaverItem, options: BoardSaverCardOptions): HTMLElement {
  const card = document.createElement('article')
  card.className = `bs-card${item.selected ? ' selected' : ''}`
  card.dataset.id = item.id

  const check = document.createElement('div')
  check.className = 'bs-check'
  check.innerHTML =
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="white"/><circle cx="12" cy="12" r="12" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 12l4 4 6-8" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  card.appendChild(check)

  const badge = document.createElement('span')
  badge.className = `bs-badge${item.isEnlarged ? ' bs-badge-hd' : ' bs-badge-thumb'}`
  badge.textContent = item.isEnlarged ? 'HD' : '⬇缩略'
  card.appendChild(badge)

  const thumb = document.createElement('div')
  thumb.className = 'bs-thumb-wrap'
  const img = document.createElement('img')
  img.src = item.url
  img.loading = 'lazy'
  img.referrerPolicy = 'no-referrer'
  img.onerror = () => {
    if (img.dataset.fallback === '1') return
    img.dataset.fallback = '1'
    img.src =
      'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIGZpbGw9Im5vbmUiPjxyZWN0IHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgZmlsbD0iI2YwZjBmMCIvPjwvc3ZnPg=='
    img.style.padding = '20px'
    img.style.objectFit = 'none'
  }
  thumb.appendChild(img)
  card.appendChild(thumb)

  const info = document.createElement('div')
  info.className = 'bs-info'
  const fn = document.createElement('div')
  fn.className = 'bs-filename'
  const rawName = item.filename || item.url.split('/').pop() || ''
  if (options.searchKeyword) {
    const idx = rawName.toLowerCase().indexOf(options.searchKeyword)
    if (idx >= 0) {
      fn.innerHTML = `${rawName.slice(0, idx)}<mark class="bs-highlight">${rawName.slice(idx, idx + options.searchKeyword.length)}</mark>${rawName.slice(idx + options.searchKeyword.length)}`
    } else {
      fn.textContent = rawName
    }
  } else {
    fn.textContent = rawName
  }
  const meta = document.createElement('div')
  meta.className = 'bs-meta-line'
  const dim = item.width && item.height ? `${item.width}×${item.height}` : ''
  meta.textContent = [dim, getFormatExt(item).toUpperCase()].filter(Boolean).join(' / ')
  info.append(fn, meta)
  card.appendChild(info)

  card.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a, button')) return
    item.selected = !item.selected
    card.classList.toggle('selected', item.selected)
    options.onToggleSelect(item)
  })
  return card
}

export function renderImportSummaryPanel(
  grid: HTMLElement,
  skippedUrls: string[],
  errorUrls: string[],
  onCopied: () => void,
): void {
  const old = grid.querySelector('.bs-import-summary')
  if (old) old.remove()

  const node = document.createElement('div')
  node.className = 'bs-import-summary'
  let html = '<div class="bs-import-summary-title">导入详情</div>'
  if (skippedUrls.length) {
    html += `<details open><summary>跳过 (${skippedUrls.length})</summary>`
    for (const u of skippedUrls) {
      html += `<div class="bs-import-url" title="${u}">${truncateImportUrl(u)}</div>`
    }
    html += '</details>'
  }
  if (errorUrls.length) {
    html += `<details open><summary>失败 (${errorUrls.length})</summary>`
    for (const u of errorUrls) {
      html += `<div class="bs-import-url" title="${u}">${truncateImportUrl(u)}</div>`
    }
    html += '</details>'
  }
  html += `<button class="bs-tool-btn" style="margin-top:6px">复制全部</button>`
  node.innerHTML = html

  node.querySelector('button')?.addEventListener('click', () => {
    const all = [...skippedUrls, ...errorUrls].join('\n')
    void navigator.clipboard.writeText(all).then(onCopied)
  })

  grid.prepend(node)
}

export function showBoardSaverToast(toastEl: HTMLElement, text: string): void {
  toastEl.textContent = text
  toastEl.classList.add('visible')
  const timer = (toastEl as HTMLElement & { _t?: ReturnType<typeof setTimeout> })._t
  if (timer) clearTimeout(timer)
  ;(toastEl as HTMLElement & { _t?: ReturnType<typeof setTimeout> })._t = setTimeout(
    () => toastEl.classList.remove('visible'),
    2800,
  )
}
