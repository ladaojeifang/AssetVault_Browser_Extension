/** Grid visibility, sort, and selection sync for Board Saver. */

import type { BoardSaverItem } from './board-saver-types'
import { itemMatchesFilter, type FilterCriteria } from './board-saver-filters'

export function syncBoardSaverCardSelection(grid: HTMLElement, items: BoardSaverItem[]): void {
  for (const it of items) {
    const c = grid.querySelector(`[data-id="${CSS.escape(it.id)}"]`) as HTMLElement | null
    if (c) c.classList.toggle('selected', it.selected)
  }
}

export function applyBoardSaverSizeSort(
  grid: HTMLElement,
  items: BoardSaverItem[],
  sortBySize: boolean,
): void {
  const cards = Array.from(grid.children) as HTMLElement[]
  cards.sort((a, b) => {
    const idA = a.dataset.id
    const idB = b.dataset.id
    if (!idA) return -1
    if (!idB) return 1
    const itemA = items.find((it) => it.id === idA)
    const itemB = items.find((it) => it.id === idB)
    if (!sortBySize || !itemA || !itemB) return 0
    const areaA = (itemA.width ?? 0) * (itemA.height ?? 0)
    const areaB = (itemB.width ?? 0) * (itemB.height ?? 0)
    return areaB - areaA
  })
  for (const c of cards) grid.appendChild(c)
}

export function applyBoardSaverFilters(
  grid: HTMLElement,
  items: BoardSaverItem[],
  criteria: FilterCriteria,
  searchKeyword: string,
): number {
  let visible = 0
  for (const it of items) {
    const c = grid.querySelector(`[data-id="${CSS.escape(it.id)}"]`) as HTMLElement | null
    if (!c) continue
    const show = itemMatchesFilter(it, criteria)
    c.style.display = show ? '' : 'none'
    if (!show) continue
    visible++
    const fnEl = c.querySelector('.bs-filename')
    if (!fnEl) continue
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
  return visible
}

export function appendBoardSaverCards(
  grid: HTMLElement,
  cards: HTMLElement[],
): void {
  grid.querySelector('.bs-empty-hint')?.remove()
  const frag = document.createDocumentFragment()
  for (const card of cards) frag.appendChild(card)
  grid.appendChild(frag)
}
