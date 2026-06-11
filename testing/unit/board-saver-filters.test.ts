import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  getFormatExt,
  getSizeCategory,
  isLowQualityItem,
  itemMatchesFilter,
  type FilterCriteria,
} from '../../src/board-saver/board-saver-filters.ts'
import type { BoardSaverItem } from '../../src/board-saver/board-saver-types.ts'

function item(partial: Partial<BoardSaverItem> & Pick<BoardSaverItem, 'url'>): BoardSaverItem {
  return {
    id: '1',
    domain: 'example.com',
    selected: true,
    discoveredAt: 0,
    source: 'scan',
    isEnlarged: false,
    ...partial,
  }
}

const defaultCriteria: FilterCriteria = {
  size: 'all',
  format: 'all',
  domain: 'all',
  keyword: '',
  hideLowQuality: false,
}

describe('getSizeCategory', () => {
  it('classifies by max dimension', () => {
    assert.equal(getSizeCategory(item({ url: 'https://x/a.jpg', width: 400, height: 300 })), 'small')
    assert.equal(getSizeCategory(item({ url: 'https://x/a.jpg', width: 800, height: 600 })), 'medium')
    assert.equal(getSizeCategory(item({ url: 'https://x/a.jpg', width: 1500, height: 900 })), 'large')
    assert.equal(getSizeCategory(item({ url: 'https://x/a.jpg', width: 2400, height: 1600 })), 'hd')
    assert.equal(getSizeCategory(item({ url: 'https://x/a.jpg' })), 'unknown')
  })
})

describe('getFormatExt', () => {
  it('reads extension from pathname', () => {
    assert.equal(getFormatExt(item({ url: 'https://cdn.example.com/path/photo.JPG?v=1' })), 'jpg')
    assert.equal(getFormatExt(item({ url: 'not-a-url' })), '')
  })

  it('returns video_page for video作品 cards', () => {
    assert.equal(
      getFormatExt(
        item({ url: 'https://www.bilibili.com/video/BV1xx411c7mD', kind: 'video_page' }),
      ),
      'video_page',
    )
  })
})

describe('isLowQualityItem', () => {
  it('flags tiny tracking and thumb URLs', () => {
    assert.equal(isLowQualityItem(item({ url: 'https://x/thumb.jpg', width: 32, height: 32 })), true)
    assert.equal(isLowQualityItem(item({ url: 'https://www.google-analytics.com/collect' })), true)
    assert.equal(isLowQualityItem(item({ url: 'https://x/hero.jpg', width: 1200, height: 800 })), false)
  })
})

describe('itemMatchesFilter', () => {
  it('applies size, format, domain, keyword, and low-quality filters', () => {
    const photo = item({
      url: 'https://cdn.example.com/gallery/photo.png',
      filename: 'vacation.png',
      domain: 'cdn.example.com',
      width: 1200,
      height: 800,
    })
    assert.equal(itemMatchesFilter(photo, { ...defaultCriteria, size: 'large' }), true)
    assert.equal(itemMatchesFilter(photo, { ...defaultCriteria, size: 'small' }), false)
    assert.equal(itemMatchesFilter(photo, { ...defaultCriteria, format: 'png' }), true)
    assert.equal(itemMatchesFilter(photo, { ...defaultCriteria, domain: 'other.com' }), false)
    assert.equal(itemMatchesFilter(photo, { ...defaultCriteria, keyword: 'vacation' }), true)
    assert.equal(itemMatchesFilter(photo, { ...defaultCriteria, keyword: 'missing' }), false)
  })
})
