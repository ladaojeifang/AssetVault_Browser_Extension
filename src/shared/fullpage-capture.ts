/** Pure helpers for full-page screenshot scroll planning (unit-testable). */

export const FULLPAGE_MAX_SCROLL_SEGMENTS = 25
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
 * Build scroll Y positions for segmented capture. Never exceeds `maxSegments` shots.
 */
export function planFullpageCapturePositions(args: {
  scrollHeightCss: number
  viewportCss: number
  maxSegments?: number
  maxScrollHeightCss?: number
}): FullpageScrollPlan {
  const maxSegments = Math.max(2, args.maxSegments ?? FULLPAGE_MAX_SCROLL_SEGMENTS)
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

/** Max single JPEG/PNG blob for direct API import (base64 inflates ~4/3). */
export const FULLPAGE_MAX_DIRECT_IMPORT_BYTES = 6 * 1024 * 1024
