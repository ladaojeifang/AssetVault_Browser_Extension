import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { classifyPageType } from '../../src/board-saver/board-saver-page-detection.ts'

describe('classifyPageType', () => {
  it('detects static short pages', () => {
    assert.equal(classifyPageType({ domChangeCount: 0, scrollHeight: 900, viewportHeight: 800 }), 'static')
  })

  it('detects lazy long pages with few DOM changes', () => {
    assert.equal(classifyPageType({ domChangeCount: 1, scrollHeight: 2400, viewportHeight: 800 }), 'lazy')
  })

  it('detects waterfall when media keeps loading', () => {
    assert.equal(classifyPageType({ domChangeCount: 5, scrollHeight: 900, viewportHeight: 800 }), 'waterfall')
  })
})
