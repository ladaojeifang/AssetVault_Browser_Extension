/** Pure filter / quality helpers for Board Saver grid. */

import type { BoardSaverItem } from './board-saver-types'

export type FilterCriteria = {
  size: string
  format: string
  domain: string
  keyword: string
  hideLowQuality: boolean
}

export function getSizeCategory(item: BoardSaverItem): string {
  const dim = Math.max(item.width ?? 0, item.height ?? 0)
  if (!dim) return 'unknown'
  if (dim < 500) return 'small'
  if (dim < 1000) return 'medium'
  if (dim < 2000) return 'large'
  return 'hd'
}

export function getFormatExt(item: BoardSaverItem): string {
  if (item.kind === 'video_page') return 'video_page'
  try {
    return (new URL(item.url).pathname.split('.').pop() || '').toLowerCase().split(/[?#]/)[0]
  } catch {
    return ''
  }
}

export function isLowQualityItem(item: BoardSaverItem): boolean {
  if (item.kind === 'video_page') return false
  const dim = Math.max(item.width ?? 0, item.height ?? 0)
  if (dim > 0 && dim < 64) return true
  if (/google-analytics|doubleclick|facebook\.com\/tr|bat\.bing|linkedin\.com\/li\/track/.test(item.url)) {
    return true
  }
  const filename = (item.url.split('/').pop() || '').toLowerCase()
  if (/\b(thumb|preview|mini|sprite|avatar|logo|badge|favicon|icon)(\.[a-z]+)?$/i.test(filename)) {
    return true
  }
  if (item.url.includes('placeholder') || item.url.includes('1x1')) return true
  return false
}

export function itemMatchesFilter(item: BoardSaverItem, criteria: FilterCriteria): boolean {
  if (criteria.size !== 'all' && getSizeCategory(item) !== criteria.size) return false
  if (criteria.format !== 'all' && getFormatExt(item) !== criteria.format) return false
  if (criteria.domain !== 'all' && item.domain !== criteria.domain) return false
  if (criteria.keyword) {
    const kw = criteria.keyword.toLowerCase()
    if (!(item.filename ?? '').toLowerCase().includes(kw) && !item.url.toLowerCase().includes(kw)) {
      return false
    }
  }
  if (criteria.hideLowQuality && isLowQualityItem(item)) return false
  return true
}
