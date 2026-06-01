import assert from 'node:assert/strict'
import test from 'node:test'
import {
  planFullpageCapturePositions,
  FULLPAGE_MAX_SCROLL_SEGMENTS,
} from '../src/shared/fullpage-capture.ts'

test('short page yields single position', () => {
  const p = planFullpageCapturePositions({ scrollHeightCss: 800, viewportCss: 900 })
  assert.deepEqual(p.positions, [0])
})

test('long page never exceeds max segments', () => {
  const p = planFullpageCapturePositions({
    scrollHeightCss: 120_000,
    viewportCss: 800,
    maxSegments: FULLPAGE_MAX_SCROLL_SEGMENTS,
  })
  assert.ok(p.positions.length <= FULLPAGE_MAX_SCROLL_SEGMENTS)
  assert.equal(p.truncated, true)
  assert.ok(p.effectiveScrollHeightCss < 120_000)
})

test('medium page fits within segment budget without truncation', () => {
  const p = planFullpageCapturePositions({
    scrollHeightCss: 12_000,
    viewportCss: 900,
  })
  assert.equal(p.truncated, false)
  assert.ok(p.positions.length <= FULLPAGE_MAX_SCROLL_SEGMENTS)
  assert.ok(p.positions[p.positions.length - 1]! >= 0)
})
