/** Mount, unmount, and panel event wiring for Board Saver. */

import {
  applyBoardSaverBatchRename,
  enterBoardSaverEditMode,
  exitBoardSaverEditMode,
  type BoardSaverEditContext,
} from './board-saver-edit'
import { BOARD_SAVER_ROOT_ID } from './board-saver-panel'
import { updateQuickSaveButton } from './board-saver-quick-save'
import type { BoardSaverItem } from './board-saver-types'
import type { PageType } from './board-saver-scan-state'

function panelEl<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T
}

export type BoardSaverHost = {
  items: BoardSaverItem[]
  getEditMode: () => boolean
  setEditMode: (value: boolean) => void
  getQuickSaveMode: () => boolean
  setQuickSaveMode: (value: boolean) => void
  getSortBySize: () => boolean
  setSortBySize: (value: boolean) => void
  getHideLowQuality: () => boolean
  setHideLowQuality: (value: boolean) => void
  setSearchKeyword: (value: string) => void
  getPageType: () => PageType
  getItemCount: () => number

  quickSaveClickHandler: (e: MouseEvent) => void
  editContext: () => BoardSaverEditContext

  close: () => void
  importSelected: () => Promise<void>
  syncCardSelection: () => void
  updateStats: () => void
  applyFilters: () => void
  updateFilterSidebar: () => void
  applySizeSort: () => void
  saveSettings: () => Promise<void>
  clearHistory: () => Promise<void>
  setStatus: (text: string) => void

  isMounted: () => boolean
  setMounted: (value: boolean) => void
  resetIdCounter: () => void
  setPageInfo: (url: string, title: string) => void
  getOverlay: () => HTMLElement | null
  setOverlay: (el: HTMLElement | null) => void
  buildPanel: () => HTMLElement
  loadHistory: () => Promise<void>
  loadSettings: () => Promise<void>
  applyPersistedUiState: () => void
  doScan: () => Promise<void>
  startPageDetection: () => void
  attachScrollWatch: () => void
  teardownScan: () => void
  resetCollectionState: () => void
}

function injectBoardSaverStyles(): void {
  if (document.querySelector('link[href*="board-saver-bridge.css"]')) return
  const cssLink = document.createElement('link')
  cssLink.rel = 'stylesheet'
  cssLink.href = chrome.runtime.getURL('board-saver-bridge.css')
  document.head.appendChild(cssLink)
}

export function bindBoardSaverEvents(host: BoardSaverHost): void {
  panelEl('bs-close-btn').addEventListener('click', host.close)
  panelEl('bs-import-selected').addEventListener('click', () => void host.importSelected())
  panelEl('bs-select-all').addEventListener('click', () => {
    for (const it of host.items) it.selected = true
    host.syncCardSelection()
    host.updateStats()
  })
  panelEl('bs-deselect-all').addEventListener('click', () => {
    for (const it of host.items) it.selected = false
    host.syncCardSelection()
    host.updateStats()
  })

  panelEl<HTMLElement>('bs-grid').addEventListener('keydown', (e) => {
    if (!host.getEditMode()) return
    const t = e.target as HTMLElement
    if (!t.classList.contains('bs-filename')) return
    if (e.key === 'Enter') {
      e.preventDefault()
      t.blur()
    }
  })

  let debounce: ReturnType<typeof setTimeout> | undefined
  panelEl<HTMLInputElement>('bs-search').addEventListener('input', () => {
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(() => {
      host.setSearchKeyword(panelEl<HTMLInputElement>('bs-search').value.trim().toLowerCase())
      host.applyFilters()
      host.updateStats()
      host.updateFilterSidebar()
    }, 250)
  })

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    if (host.getEditMode()) {
      host.setEditMode(false)
      exitBoardSaverEditMode(host.editContext(), false)
      return
    }
    if (host.getQuickSaveMode()) {
      panelEl('bs-quick-save').click()
      return
    }
    host.close()
  })

  panelEl('bs-edit-preview').addEventListener('click', () => {
    host.setEditMode(!host.getEditMode())
    if (host.getEditMode()) {
      enterBoardSaverEditMode(host.editContext(), () => applyBoardSaverBatchRename(host.editContext()))
    } else {
      exitBoardSaverEditMode(host.editContext(), true)
    }
  })

  panelEl('bs-hide-low-qty').addEventListener('click', () => {
    host.setHideLowQuality(!host.getHideLowQuality())
    const btn = panelEl('bs-hide-low-qty')
    btn.classList.toggle('active', host.getHideLowQuality())
    btn.textContent = host.getHideLowQuality() ? '质量✓' : '质量'
    host.applyFilters()
    host.updateStats()
    void host.saveSettings()
  })

  panelEl('bs-sort-size').addEventListener('click', () => {
    host.setSortBySize(!host.getSortBySize())
    const btn = panelEl('bs-sort-size')
    btn.classList.toggle('active', host.getSortBySize())
    btn.textContent = host.getSortBySize() ? '尺寸↓✓' : '尺寸↓'
    host.applySizeSort()
    host.updateStats()
    void host.saveSettings()
  })

  panelEl('bs-quick-save').addEventListener('click', () => {
    host.setQuickSaveMode(!host.getQuickSaveMode())
    updateQuickSaveButton(host.getQuickSaveMode())
    if (host.getQuickSaveMode()) {
      document.addEventListener('click', host.quickSaveClickHandler, true)
      host.setStatus('快采模式：点击页面图片直接保存')
    } else {
      document.removeEventListener('click', host.quickSaveClickHandler, true)
      host.setStatus('就绪')
    }
  })

  const backdrop = document.querySelector(`#${BOARD_SAVER_ROOT_ID} .bs-backdrop`) as HTMLElement | null
  backdrop?.addEventListener('click', host.close)

  document.getElementById('bs-clear-history')?.addEventListener('click', () => void host.clearHistory())
}

export function mountBoardSaver(host: BoardSaverHost): void {
  if (host.isMounted()) return
  host.setMounted(true)
  host.setPageInfo(location.href, document.title)
  host.resetIdCounter()
  injectBoardSaverStyles()

  const overlay = host.buildPanel()
  host.setOverlay(overlay)
  document.body.appendChild(overlay)
  bindBoardSaverEvents(host)
  host.attachScrollWatch()
  void host.loadHistory()
  void host.loadSettings().then(() => host.applyPersistedUiState())

  host.setStatus('🔍 正在分析页面…')
  void host.doScan().then(() => {
    host.startPageDetection()
    setTimeout(() => {
      if (host.getPageType() === 'static') {
        void host.doScan().then(() => host.setStatus(`✅ 已采集全部 ${host.getItemCount()} 项`))
      }
    }, 2500)
  })
}

export function unmountBoardSaver(host: BoardSaverHost): void {
  if (!host.isMounted()) return
  host.teardownScan()
  if (host.getQuickSaveMode()) {
    host.setQuickSaveMode(false)
    document.removeEventListener('click', host.quickSaveClickHandler, true)
  }
  host.resetCollectionState()
  host.getOverlay()?.remove()
  host.setOverlay(null)
  host.setMounted(false)
}
