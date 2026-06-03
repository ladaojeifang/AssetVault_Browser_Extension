/** Pure helpers for full-page screenshot scroll planning (unit-testable). */
/** 0 = no artificial cap (still subject to Chrome captureVisibleTab rate limits). */
export const FULLPAGE_MAX_SCROLL_SEGMENTS = 0
export const FULLPAGE_OVERLAP_CSS_MAX = 200
/** Cap CSS scroll height to avoid runaway memory / import payload. */
export const FULLPAGE_MAX_SCROLL_HEIGHT_CSS = 40_000

export type FullpageScrollPlan = {
  positions: number[]
  stepCss: number
  overlapCss: number
  /** True when page scroll height exceeded cap. */
  truncated: boolean
  effectiveScrollHeightCss: number
}

/**
 * Build scroll Y positions for segmented capture.
 * `maxSegments` <= 0 means uncapped (only page height / Chrome quota limit).
 */
export function planFullpageCapturePositions(args: {
  scrollHeightCss: number
  viewportCss: number
  maxSegments?: number
  maxScrollHeightCss?: number
}): FullpageScrollPlan {
  const cap = args.maxSegments ?? FULLPAGE_MAX_SCROLL_SEGMENTS
  const maxSegments = cap <= 0 ? Number.MAX_SAFE_INTEGER : Math.max(2, cap)
  const maxScroll = args.maxScrollHeightCss ?? FULLPAGE_MAX_SCROLL_HEIGHT_CSS
  const viewportCss = Math.max(1, Math.round(args.viewportCss))

  let effectiveScrollHeightCss = Math.max(1, Math.round(args.scrollHeightCss))
  let truncated = false
  if (effectiveScrollHeightCss > maxScroll) {
    effectiveScrollHeightCss = maxScroll
    truncated = true
  }

  if (effectiveScrollHeightCss <= viewportCss + 1) {
    return {
      positions: [0],
      stepCss: viewportCss,
      overlapCss: 0,
      truncated,
      effectiveScrollHeightCss,
    }
  }

  const overlapTargetCss = Math.min(FULLPAGE_OVERLAP_CSS_MAX, Math.max(0, viewportCss - 1))
  const preferredStepCss = Math.max(1, viewportCss - overlapTargetCss)
  const minStepForSegments = Math.ceil(
    (effectiveScrollHeightCss - viewportCss) / Math.max(1, maxSegments - 1),
  )
  const stepCss = Math.max(preferredStepCss, minStepForSegments)
  const overlapCss = Math.max(0, viewportCss - stepCss)

  const positions: number[] = []
  for (let y = 0; y + viewportCss < effectiveScrollHeightCss - 1; y += stepCss) {
    positions.push(Math.max(0, Math.round(y)))
    if (positions.length >= maxSegments) break
  }

  const lastY = Math.max(0, Math.round(effectiveScrollHeightCss - viewportCss))
  if (positions.length === 0) {
    positions.push(lastY)
  } else if (positions[positions.length - 1] !== lastY) {
    if (positions.length >= maxSegments) {
      positions[positions.length - 1] = lastY
    } else {
      positions.push(lastY)
    }
  }

  return {
    positions,
    stepCss,
    overlapCss,
    truncated,
    effectiveScrollHeightCss,
  }
}

/** Target max JPEG blob before base64 (must stay under API JSON body limit). */
export const FULLPAGE_MAX_DIRECT_IMPORT_BYTES = 512 * 1024

/** Per-chunk JPEG budget for POST /asset/importFromDataUrl (~768KB JSON cap). */
export const FULLPAGE_IMPORT_CHUNK_MAX_BYTES = 380 * 1024

/** Estimate max strip height that fits one API import chunk at given width. */
export function estimateMaxChunkHeightPx(
  widthPx: number,
  maxBytes: number = FULLPAGE_IMPORT_CHUNK_MAX_BYTES,
): number {
  const w = Math.max(1, Math.round(widthPx))
  return Math.max(1, Math.floor(maxBytes / (w * 3 * 0.35)))
}

/** Conservative Canvas limits (match service-worker). */
export const FULLPAGE_CANVAS_MAX_SIDE = 16384
export const FULLPAGE_CANVAS_MAX_PIXELS = 80_000_000

export type FullpageOutputLayout = {
  widthPx: number
  totalHeightPx: number
  captureScale: number
  outputStripHeightPx: number
  outputCount: number
  scrollPlan: FullpageScrollPlan
}

/** Pixel layout for stitching + vertical strip export (pure, no DOM). */
export function computeFullpageOutputLayout(args: {
  scrollHeightCss: number
  innerWidthCss: number
  viewportCss: number
  firstBitmapWidthPx: number
  maxSegments?: number
  maxScrollHeightCss?: number
}): FullpageOutputLayout {
  const innerWidthCss = Math.max(1, Math.round(args.innerWidthCss))
  const scrollPlan = planFullpageCapturePositions({
    scrollHeightCss: args.scrollHeightCss,
    viewportCss: args.viewportCss,
    maxSegments: args.maxSegments,
    maxScrollHeightCss: args.maxScrollHeightCss,
  })

  let widthPx = Math.max(1, Math.round(args.firstBitmapWidthPx))
  let captureScale = widthPx / innerWidthCss
  let totalHeightPx = Math.max(1, Math.round(scrollPlan.effectiveScrollHeightCss * captureScale))

  if (widthPx > FULLPAGE_CANVAS_MAX_SIDE) {
    const shrink = FULLPAGE_CANVAS_MAX_SIDE / widthPx
    widthPx = FULLPAGE_CANVAS_MAX_SIDE
    captureScale *= shrink
    totalHeightPx = Math.max(1, Math.round(scrollPlan.effectiveScrollHeightCss * captureScale))
  }

  let outputStripHeightPx = Math.min(
    FULLPAGE_CANVAS_MAX_SIDE,
    Math.max(1, Math.floor(FULLPAGE_CANVAS_MAX_PIXELS / Math.max(1, widthPx))),
  )
  if (outputStripHeightPx <= 0) {
    outputStripHeightPx = Math.max(1, Math.min(FULLPAGE_CANVAS_MAX_SIDE, totalHeightPx))
  }

  const outputCount = planFullpageExportStripCount(totalHeightPx, outputStripHeightPx)

  return {
    widthPx,
    totalHeightPx,
    captureScale,
    outputStripHeightPx,
    outputCount,
    scrollPlan,
  }
}

/** Non-zero export strip heights in order (import loop uses these). */
export function listFullpageExportStripHeights(
  contentHeightPx: number,
  stripHeightPx: number,
): number[] {
  const count = planFullpageExportStripCount(contentHeightPx, stripHeightPx)
  const heights: number[] = []
  for (let k = 0; k < count; k++) {
    const h = fullpageStripExportHeightPx(k, contentHeightPx, stripHeightPx)
    if (h > 0) heights.push(h)
  }
  return heights
}

/** Rough JPEG upper bound (uncompressed RGB × quality factor). */
export function estimateJpegBlobUpperBound(widthPx: number, heightPx: number): number {
  return Math.ceil(widthPx * heightPx * 3 * 0.35)
}

/** How many vertical strips to export when content height is partial. */
export function planFullpageExportStripCount(contentHeightPx: number, stripHeightPx: number): number {
  const h = Math.max(1, Math.round(contentHeightPx))
  const strip = Math.max(1, Math.round(stripHeightPx))
  return Math.max(1, Math.ceil(h / strip))
}

/** Pixel height to export for one strip (0 = skip empty tail strip). */
export function fullpageStripExportHeightPx(
  stripIndex: number,
  contentHeightPx: number,
  stripHeightPx: number,
): number {
  const yStart = stripIndex * stripHeightPx
  return Math.max(0, Math.min(stripHeightPx, contentHeightPx - yStart))
}

/** Target size for one merged full-page image (fits GPU / memory limits). */
export function planMergedFullpageDimensions(
  widthPx: number,
  contentHeightPx: number,
  maxPixels: number = FULLPAGE_CANVAS_MAX_PIXELS,
  maxSide: number = FULLPAGE_CANVAS_MAX_SIDE,
): { widthPx: number; heightPx: number; scaledDown: boolean } {
  let w = Math.max(1, Math.round(widthPx))
  let h = Math.max(1, Math.round(contentHeightPx))
  let scaledDown = false

  if (w * h > maxPixels) {
    const scale = Math.sqrt(maxPixels / (w * h))
    w = Math.max(1, Math.floor(w * scale))
    h = Math.max(1, Math.floor(h * scale))
    scaledDown = true
  }
  if (h > maxSide) {
    const s = maxSide / h
    w = Math.max(1, Math.floor(w * s))
    h = maxSide
    scaledDown = true
  }
  if (w > maxSide) {
    const s = maxSide / w
    w = maxSide
    h = Math.max(1, Math.floor(h * s))
    scaledDown = true
  }

  return { widthPx: w, heightPx: h, scaledDown }
}
