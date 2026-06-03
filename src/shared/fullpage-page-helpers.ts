/** Scroll position tolerance (CSS px) before capture — see docs/fullpage-capture-quality-adoptions.md */
export const FULLPAGE_SCROLL_TOLERANCE_CSS = 2

export function isFullpageScrollAtTarget(plannedYCss: number, actualYCss: number): boolean {
  return Math.abs(Math.round(plannedYCss) - Math.round(actualYCss)) <= FULLPAGE_SCROLL_TOLERANCE_CSS
}

export type FullpageFloatingMetrics = {
  position: string
  display: string
  visibility: string
  opacity: string
  clientWidth: number
  clientHeight: number
  rectTop: number
  rectBottom: number
  rectLeft: number
  rectRight: number
  styleRight: string
  styleTop: string
  styleBottom: string
  styleHeight: string
  styleWidth: string
  innerWidth: number
  innerHeight: number
  bodyClientWidth: number
}

export function isFullpageFloatingCandidate(m: FullpageFloatingMetrics): boolean {
  if (m.display === 'none' || m.visibility === 'hidden' || m.opacity === '0') return false
  if (m.position !== 'fixed' && m.position !== 'sticky') return false
  const inView =
    m.rectBottom > 0 && m.rectTop < m.innerHeight && m.rectRight > 0 && m.rectLeft < m.innerWidth
  return inView
}

/** Elements that should not be hidden during normal (non–last-frame) capture. */
export function shouldKeepFullpageFloating(m: FullpageFloatingMetrics): boolean {
  const cw = m.clientWidth
  const ch = m.clientHeight
  const iw = m.innerWidth
  const ih = m.innerHeight
  const bw = m.bodyClientWidth
  const area = cw * ch
  const viewArea = iw * ih

  if (area < 5625 && ch < ih) return true

  if (m.styleRight === '0px' && m.styleTop === '0px' && ch === ih && cw < 0.3 * iw) return true

  if (m.styleBottom === '0px' && m.styleTop !== '0px' && ch < 0.3 * ih) {
    if (Math.abs(cw - bw) <= 2 || cw >= iw * 0.95) return true
  }

  if (area > 0.7 * viewArea) return true

  if (m.position === 'fixed' && m.styleTop === '0px' && ch === ih && (m.styleWidth === '100%' || cw === iw)) {
    return true
  }

  return false
}

/** Last frame: force-hide bottom bars (e.g. cookie) even if kept earlier. */
export function shouldForceHideFullpageFloatingOnLastFrame(m: FullpageFloatingMetrics): boolean {
  if (m.position !== 'fixed') return false
  if (m.styleBottom !== '0px') return false
  if (m.clientHeight >= 0.3 * m.innerHeight) return false
  const cw = m.clientWidth
  const bw = m.bodyClientWidth
  return Math.abs(cw - bw) <= 2 || cw >= bw * 0.95
}

export function shouldHideFullpageFloating(m: FullpageFloatingMetrics, lastFrame: boolean): boolean {
  if (!isFullpageFloatingCandidate(m)) return false
  if (lastFrame && shouldForceHideFullpageFloatingOnLastFrame(m)) return true
  if (shouldKeepFullpageFloating(m)) return false
  return true
}
