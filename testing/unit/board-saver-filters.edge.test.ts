import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  getFormatExt,
  getSizeCategory,
  isLowQualityItem,
  itemMatchesFilter,
  type FilterCriteria
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
    ...partial
  }
}

const base: FilterCriteria = {
  size: 'all',
  format: 'all',
  domain: 'all',
  keyword: '',
  hideLowQuality: false
}

describe('board saver filter edge cases', () => {
  it('size boundaries at 500 / 1000 / 2000', () => {
    assert.equal(getSizeCategory(item({ url: 'https://x/a.jpg', width: 499, height: 100 })), 'small')
    assert.equal(getSizeCategory(item({ url: 'https://x/a.jpg', width: 500, height: 100 })), 'medium')
    assert.equal(getSizeCategory(item({ url: 'https://x/a.jpg', width: 1999, height: 100 })), 'large')
    assert.equal(getSizeCategory(item({ url: 'https://x/a.jpg', width: 2000, height: 100 })), 'hd')
  })

  it('format filter matches video_page kind separately from URL extension', () => {
    const videoCard = item({
      url: 'https://www.bilibili.com/video/BV1xx411c7mD',
      kind: 'video_page',
      domain: 'bilibili.com'
    })
    assert.equal(getFormatExt(videoCard), 'video_page')
    assert.equal(itemMatchesFilter(videoCard, { ...base, format: 'video_page' }), true)
    assert.equal(itemMatchesFilter(videoCard, { ...base, format: 'mp4' }), false)
  })

  it('hideLowQuality removes tracking pixels but keeps hero images', () => {
    const thumb = item({ url: 'https://cdn.example.com/preview-thumb.jpg', width: 48, height: 48 })
    const hero = item({ url: 'https://cdn.example.com/hero.jpg', width: 1920, height: 1080 })
    const criteria = { ...base, hideLowQuality: true }
    assert.equal(itemMatchesFilter(thumb, criteria), false)
    assert.equal(itemMatchesFilter(hero, criteria), true)
  })

  it('keyword matches filename when URL path is opaque', () => {
    const row = item({
      url: 'https://cdn.example.com/x/abc123',
      filename: 'vacation-beach.png',
      domain: 'cdn.example.com'
    })
    assert.equal(itemMatchesFilter(row, { ...base, keyword: 'beach' }), true)
    assert.equal(isLowQualityItem(row), false)
  })

  it('combined filters require all criteria', () => {
    const row = item({
      url: 'https://images.example.com/gallery/photo.webp',
      filename: 'photo.webp',
      domain: 'images.example.com',
      width: 1600,
      height: 900
    })
    assert.equal(
      itemMatchesFilter(row, {
        size: 'large',
        format: 'webp',
        domain: 'images.example.com',
        keyword: 'photo',
        hideLowQuality: false
      }),
      true
    )
    assert.equal(
      itemMatchesFilter(row, {
        size: 'large',
        format: 'webp',
        domain: 'images.example.com',
        keyword: 'missing',
        hideLowQuality: false
      }),
      false
    )
  })
})
