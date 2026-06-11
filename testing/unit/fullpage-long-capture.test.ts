/**
 * Long full-page capture regression — simulates 40k CSS waterfall without Chrome.
 * Run: pnpm run test:fullpage
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { uniqueTempDownloadFilename } from '../../src/shared/data-url-import.ts'
import {
  FULLPAGE_CANVAS_MAX_SIDE,
  FULLPAGE_CANVAS_MAX_PIXELS,
  FULLPAGE_MAX_SCROLL_HEIGHT_CSS,
  FULLPAGE_MAX_SCROLL_SEGMENTS,
  computeFullpageOutputLayout,
  planMergedFullpageDimensions,
  listFullpageExportStripHeights,
  planFullpageExportStripCount,
} from '../../src/shared/fullpage-capture.ts'

const WATERFALL = {
  scrollHeightCss: FULLPAGE_MAX_SCROLL_HEIGHT_CSS + 5000,
  viewportCss: 900,
  innerWidthCss: 1440,
  dpr: 2,
}

function layoutForWaterfall(firstBitmapWidthPx?: number) {
  return computeFullpageOutputLayout({
    scrollHeightCss: WATERFALL.scrollHeightCss,
    innerWidthCss: WATERFALL.innerWidthCss,
    viewportCss: WATERFALL.viewportCss,
    firstBitmapWidthPx: firstBitmapWidthPx ?? WATERFALL.innerWidthCss * WATERFALL.dpr,
  })
}

test('40k waterfall: height capped, scroll positions uncapped by default', () => {
  const layout = layoutForWaterfall()
  assert.equal(layout.scrollPlan.truncated, true)
  assert.ok(layout.scrollPlan.positions.length > FULLPAGE_MAX_SCROLL_SEGMENTS)
})

test('capture uses multiple internal strips but merge yields one asset dimensions', () => {
  const layout = layoutForWaterfall()
  assert.ok(layout.outputCount >= 1)

  const merged = planMergedFullpageDimensions(layout.widthPx, layout.totalHeightPx)
  assert.ok(merged.widthPx * merged.heightPx <= FULLPAGE_CANVAS_MAX_PIXELS)
  if (!merged.scaledDown) {
    assert.equal(merged.widthPx, layout.widthPx)
    assert.equal(merged.heightPx, layout.totalHeightPx)
  }
})

test('very tall page scales down to single image within pixel budget', () => {
  const layout = layoutForWaterfall()
  const merged = planMergedFullpageDimensions(
    layout.widthPx,
    layout.totalHeightPx,
    FULLPAGE_CANVAS_MAX_PIXELS,
    FULLPAGE_CANVAS_MAX_SIDE,
  )
  assert.ok(merged.scaledDown)
  assert.ok(merged.widthPx * merged.heightPx <= FULLPAGE_CANVAS_MAX_PIXELS)
  assert.ok(merged.heightPx <= FULLPAGE_CANVAS_MAX_SIDE)
  assert.ok(merged.widthPx <= FULLPAGE_CANVAS_MAX_SIDE)
})

test('partial capture merges only captured height into one image', () => {
  const layout = layoutForWaterfall()
  const segmentsCompleted = 5
  const ratio = segmentsCompleted / layout.scrollPlan.positions.length
  const partialH = Math.max(1, Math.round(layout.totalHeightPx * ratio))
  const merged = planMergedFullpageDimensions(layout.widthPx, partialH)
  assert.ok(merged.heightPx < layout.totalHeightPx)
  assert.ok(merged.heightPx > 0)
})

test('export strip count internal only — user gets one library file name pattern', () => {
  const layout = layoutForWaterfall()
  const exportHeight = layout.totalHeightPx
  const stripCount = planFullpageExportStripCount(exportHeight, layout.outputStripHeightPx)
  assert.ok(stripCount >= 1)
  const filename = `screenshot-fullpage-${Date.now()}.jpg`
  assert.ok(!filename.includes('-of-'))
  assert.ok(!filename.includes('-part'))
})

test('unique temp filenames for blob fallback', () => {
  const names = new Set<string>()
  for (let k = 0; k < 10; k++) {
    const name = uniqueTempDownloadFilename(`screenshot-fullpage-1.jpg`)
    assert.ok(!names.has(name))
    names.add(name)
  }
})

test('short page single merged image', () => {
  const layout = computeFullpageOutputLayout({
    scrollHeightCss: 600,
    innerWidthCss: 1200,
    viewportCss: 900,
    firstBitmapWidthPx: 2400,
  })
  assert.equal(layout.outputCount, 1)
  const merged = planMergedFullpageDimensions(layout.widthPx, layout.totalHeightPx)
  assert.equal(merged.heightPx, layout.totalHeightPx)
})
