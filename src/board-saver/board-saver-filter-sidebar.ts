/** Filter sidebar row builder for Board Saver panel. */

import type { BoardSaverItem } from './board-saver-types'
import { getFormatExt, getSizeCategory } from './board-saver-filters'

export type FilterSidebarActive = {
  size: string
  format: string
  domain: string
}

export type FilterSidebarHandlers = {
  onSizeChange: (value: string) => void
  onFormatChange: (value: string) => void
  onDomainChange: (value: string) => void
  onFilterApplied: () => void
  onPersist: () => void
}

function buildFilterRow(
  cid: string,
  opts: Array<{ value: string; label: string; count: number }>,
  active: string,
  onChange: (v: string) => void,
  handlers: Pick<FilterSidebarHandlers, 'onFilterApplied' | 'onPersist'>,
): void {
  const container = document.getElementById(cid)
  if (!container) return
  container.innerHTML = ''
  for (const o of opts) {
    const row = document.createElement('div')
    row.className = `bs-filter-item${active === o.value ? ' active' : ''}`
    row.innerHTML = `<span>${o.label}</span><span class="bs-filter-count">${o.count}</span>`
    row.addEventListener('click', () => {
      onChange(o.value)
      handlers.onFilterApplied()
      handlers.onPersist()
    })
    container.appendChild(row)
  }
}

export function updateBoardSaverFilterSidebar(
  items: BoardSaverItem[],
  active: FilterSidebarActive,
  handlers: FilterSidebarHandlers,
): void {
  const sizes: Record<string, number> = { all: items.length, small: 0, medium: 0, large: 0, hd: 0, unknown: 0 }
  const formats: Record<string, number> = { all: items.length }
  const domains: Record<string, number> = { all: items.length }

  for (const it of items) {
    sizes[getSizeCategory(it)] = (sizes[getSizeCategory(it)] || 0) + 1
    const f = getFormatExt(it) || 'other'
    formats[f] = (formats[f] || 0) + 1
    if (it.domain) domains[it.domain] = (domains[it.domain] || 0) + 1
  }

  buildFilterRow(
    'bs-filter-size',
    [
      { value: 'all', label: '全部', count: sizes.all },
      { value: 'small', label: '小 (<500px)', count: sizes.small },
      { value: 'medium', label: '中 (500-999)', count: sizes.medium },
      { value: 'large', label: '大 (1000-1999)', count: sizes.large },
      { value: 'hd', label: 'HD (≥2000)', count: sizes.hd },
    ],
    active.size,
    handlers.onSizeChange,
    handlers,
  )

  const fmtOpts = Object.entries(formats)
    .filter(([k]) => k !== 'all')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, v]) => ({ value: k, label: `.${k}`, count: v }))
  buildFilterRow(
    'bs-filter-format',
    [{ value: 'all', label: '全部', count: formats.all }, ...fmtOpts],
    active.format,
    handlers.onFormatChange,
    handlers,
  )

  const domOpts = Object.entries(domains)
    .filter(([k]) => k !== 'all')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([k, v]) => ({ value: k, label: k, count: v }))
  buildFilterRow(
    'bs-filter-domain',
    [{ value: 'all', label: '全部', count: domains.all }, ...domOpts],
    active.domain,
    handlers.onDomainChange,
    handlers,
  )
}
