import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FULLPAGE_MAX_SCROLL_SEGMENTS,
  fullpageStripExportHeightPx,
  planFullpageCapturePositions,
  planFullpageExportStripCount,
} from '../../src/shared/fullpage-capture.ts'

test('short page yields single position', () => {
  const p = planFullpageCapturePositions({ scrollHeightCss: 800, viewportCss: 900 })
  assert.deepEqual(p.positions, [0])
})

test('long page uncapped scroll positions follow page height', () => {
  const p = planFullpageCapturePositions({
    scrollHeightCss: 12_000,
    viewportCss: 800,
    maxSegments: 0,
  })
  assert.equal(p.truncated, false)
  assert.ok(p.positions.length > 10)
})

test('long page respects optional maxSegments cap', () => {
  const p = planFullpageCapturePositions({
    scrollHeightCss: 120_000,
    viewportCss: 800,
    maxSegments: 25,
  })
  assert.ok(p.positions.length <= 25)
  assert.equal(p.truncated, true)
  assert.ok(p.effectiveScrollHeightCss < 120_000)
})

test('medium page fits within default plan', () => {
  const p = planFullpageCapturePositions({
    scrollHeightCss: 12_000,
    viewportCss: 900,
    maxSegments: 0,
  })
  assert.equal(p.truncated, false)
  assert.ok(p.positions[p.positions.length - 1]! >= 0)
})

test('export strip count follows partial content height', () => {
  assert.equal(planFullpageExportStripCount(5000, 2000), 3)
  assert.equal(fullpageStripExportHeightPx(2, 5000, 2000), 1000)
  assert.equal(fullpageStripExportHeightPx(3, 5000, 2000), 0)
})
