import {
  computeFullpageOutputLayout,
  fullpageStripExportHeightPx,
  planFullpageCapturePositions,
  planFullpageExportStripCount,
  type FullpageOutputLayout,
  type FullpageScrollPlan,
} from './fullpage-capture'

export type FullpageOutputBufferInit = {
  scrollHeightCss: number
  innerWidthCss: number
  viewportCss: number
  scrollPlan: FullpageScrollPlan
}

/** Lazy per-strip OffscreenCanvas stitching (avoids pre-allocating full page upfront). */
export class FullpageOutputBuffer {
  readonly overlapCss: number
  scrollPlan: FullpageScrollPlan

  private readonly innerWidthCss: number
  private readonly viewportCss: number
  private scrollHeightCss: number

  private layout: FullpageOutputLayout | null = null
  private outputCanvases: OffscreenCanvas[] = []
  private outputCtxs: OffscreenCanvasRenderingContext2D[] = []
  maxContentBottomPx = 0

  constructor(init: FullpageOutputBufferInit) {
    this.scrollHeightCss = init.scrollHeightCss
    this.innerWidthCss = init.innerWidthCss
    this.viewportCss = init.viewportCss
    this.scrollPlan = init.scrollPlan
    this.overlapCss = init.scrollPlan.overlapCss
  }

  get effectiveScrollHeightCss(): number {
    return this.scrollPlan.effectiveScrollHeightCss
  }

  get widthPx(): number {
    return this.layout?.widthPx ?? 0
  }

  get captureScale(): number {
    return this.layout?.captureScale ?? 1
  }

  get totalHeightPx(): number {
    return this.layout?.totalHeightPx ?? 0
  }

  get outputStripHeightPx(): number {
    return this.layout?.outputStripHeightPx ?? 0
  }

  get overlapPx(): number {
    if (!this.layout) return 0
    return Math.max(0, Math.round(this.overlapCss * this.layout.captureScale))
  }

  get initialized(): boolean {
    return this.layout !== null
  }

  /** Extend scroll plan when page grows (lazy load). Returns newly added Y positions. */
  extendScrollHeightIfTaller(nextHeightCss: number): number[] {
    const h = Math.max(this.scrollHeightCss, Math.round(nextHeightCss))
    if (h <= this.scrollHeightCss) return []
    this.scrollHeightCss = h
    const prev = new Set(this.scrollPlan.positions)
    this.scrollPlan = planFullpageCapturePositions({
      scrollHeightCss: h,
      viewportCss: this.viewportCss,
      maxSegments: 0,
    })
    if (this.layout) {
      const next = computeFullpageOutputLayout({
        scrollHeightCss: h,
        innerWidthCss: this.innerWidthCss,
        viewportCss: this.viewportCss,
        firstBitmapWidthPx: this.layout.widthPx,
      })
      // Keep strip height budget stable; only grow vertical extent (canvases resize in ensureStripCanvas).
      this.layout = {
        ...this.layout,
        totalHeightPx: next.totalHeightPx,
        outputCount: next.outputCount,
        scrollPlan: this.scrollPlan,
      }
    }
    return this.scrollPlan.positions.filter((y) => !prev.has(y))
  }

  initFromFirstBitmap(bitmap: ImageBitmap): void {
    if (this.layout) return
    this.layout = computeFullpageOutputLayout({
      scrollHeightCss: this.scrollHeightCss,
      innerWidthCss: this.innerWidthCss,
      viewportCss: this.viewportCss,
      firstBitmapWidthPx: bitmap.width,
    })
    this.scrollPlan = this.layout.scrollPlan
  }

  private requiredStripHeightPx(stripIndex: number): number {
    if (!this.layout) return 1
    return fullpageStripExportHeightPx(
      stripIndex,
      this.layout.totalHeightPx,
      this.layout.outputStripHeightPx,
    )
  }

  private ensureStripCanvas(stripIndex: number): void {
    if (!this.layout) throw new Error('FullpageOutputBuffer not initialized')
    const { widthPx } = this.layout
    const neededH = this.requiredStripHeightPx(stripIndex)

    while (this.outputCanvases.length <= stripIndex) {
      const k = this.outputCanvases.length
      const h = this.requiredStripHeightPx(k)
      const c = new OffscreenCanvas(widthPx, Math.max(1, h))
      const ctx = c.getContext('2d')
      if (!ctx) throw new Error('No 2d context')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, widthPx, Math.max(1, h))
      this.outputCanvases.push(c)
      this.outputCtxs.push(ctx)
    }

    const existing = this.outputCanvases[stripIndex]!
    if (existing.height >= neededH) return

    const grown = new OffscreenCanvas(widthPx, Math.max(1, neededH))
    const gctx = grown.getContext('2d')
    if (!gctx) throw new Error('No 2d context')
    gctx.fillStyle = '#ffffff'
    gctx.fillRect(0, 0, widthPx, Math.max(1, neededH))
    gctx.drawImage(existing, 0, 0)
    this.outputCanvases[stripIndex] = grown
    this.outputCtxs[stripIndex] = gctx
  }

  drawSegment(bitmap: ImageBitmap, yCss: number, isFirst: boolean): void {
    if (!this.layout) throw new Error('FullpageOutputBuffer not initialized')
    const { totalHeightPx, captureScale } = this.layout
    const srcCropTopPx = isFirst ? 0 : this.overlapPx
    const drawableHeightPx = Math.max(0, bitmap.height - srcCropTopPx)
    const destStartPx = Math.max(0, Math.round((yCss + (isFirst ? 0 : this.overlapCss)) * captureScale))
    const drawHeightPx = Math.max(0, Math.min(drawableHeightPx, totalHeightPx - destStartPx))
    if (drawHeightPx <= 0) return

    const destEndPx = destStartPx + drawHeightPx
    const srcW = Math.max(1, bitmap.width)
    const stripH = this.layout.outputStripHeightPx

    for (let k = 0; k < planFullpageExportStripCount(totalHeightPx, stripH); k++) {
      const yStart = k * stripH
      const yEnd = Math.min(totalHeightPx, (k + 1) * stripH)
      const interStart = Math.max(destStartPx, yStart)
      const interEnd = Math.min(destEndPx, yEnd)
      const interH = interEnd - interStart
      if (interH <= 0) continue

      this.ensureStripCanvas(k)
      const srcY = srcCropTopPx + (interStart - destStartPx)
      const destY = interStart - yStart
      this.outputCtxs[k]!.drawImage(bitmap, 0, srcY, srcW, interH, 0, destY, this.layout.widthPx, interH)
    }

    this.maxContentBottomPx = Math.max(this.maxContentBottomPx, destStartPx + drawHeightPx)
  }

  exportStrips(exportHeightPx: number): { canvases: OffscreenCanvas[]; heights: number[] } {
    if (!this.layout) return { canvases: [], heights: [] }
    const count = planFullpageExportStripCount(exportHeightPx, this.layout.outputStripHeightPx)
    const canvases: OffscreenCanvas[] = []
    const heights: number[] = []
    for (let k = 0; k < count; k++) {
      const plannedH = fullpageStripExportHeightPx(k, exportHeightPx, this.layout.outputStripHeightPx)
      if (plannedH <= 0) continue
      this.ensureStripCanvas(k)
      const src = this.outputCanvases[k]!
      const exportH = Math.min(plannedH, src.height)
      if (exportH <= 0) continue

      const out =
        exportH === src.height
          ? src
          : (() => {
              const cropped = new OffscreenCanvas(src.width, exportH)
              const ctx = cropped.getContext('2d')
              if (!ctx) throw new Error('No 2d context')
              ctx.fillStyle = '#ffffff'
              ctx.fillRect(0, 0, src.width, exportH)
              ctx.drawImage(src, 0, 0, src.width, exportH, 0, 0, src.width, exportH)
              return cropped
            })()

      canvases.push(out)
      heights.push(out.height)
    }
    return { canvases, heights }
  }
}
