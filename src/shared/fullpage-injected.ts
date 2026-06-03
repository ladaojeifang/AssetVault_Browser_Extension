/**
 * Page-context full-page capture (injected via files: ['fullpage-injected.js']).
 * Built as IIFE in vite (see buildFullpageInjectedIife) — must not ship as ES module with import.
 */
import {
  shouldHideFullpageFloating,
  type FullpageFloatingMetrics,
} from './fullpage-page-helpers'

const FLAG_SCROLL_EL = '__assetvault_fullpage_scroll_el__'
const FLAG_RESTORE = '__assetvault_fullpage_restore__'
const FLAG_ABORT_KEY = '__assetvault_fullpage_abort_key__'

type FixedRestore = {
  el: HTMLElement
  visibility: string
  pointerEvents: string
  opacity: string
}

type RestoreState = {
  fixed: FixedRestore[]
  videos: Array<{ v: HTMLVideoElement; shouldResume: boolean }>
  scrollTop: number
}

export type FullpageSetupResult = {
  scrollHeightCss: number
  viewportHeightCss: number
  innerWidthCss: number
  dpr: number
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function getMainScrollElement(): HTMLElement {
  const candidates: HTMLElement[] = []
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('*'))
  for (const el of nodes) {
    const style = getComputedStyle(el)
    const overflowY = style.overflowY
    if (!(overflowY?.includes('auto') || overflowY?.includes('scroll'))) continue
    if (style.visibility === 'hidden' || style.display === 'none') continue
    if (el.scrollHeight > el.clientHeight + 1) candidates.push(el)
  }
  if (document.documentElement.scrollHeight > document.documentElement.clientHeight + 1) {
    candidates.push(document.documentElement)
  }
  if (document.body?.scrollHeight > document.body.clientHeight + 1) {
    candidates.push(document.body)
  }
  if (!candidates.length) return document.documentElement

  const vw = window.innerWidth
  const vh = window.innerHeight
  candidates.sort((a, b) => {
    const aScore =
      (a.scrollHeight - a.clientHeight) * 2 +
      Math.min(a.clientHeight, vh) / vh +
      Math.min(a.clientWidth, vw) / vw
    const bScore =
      (b.scrollHeight - b.clientHeight) * 2 +
      Math.min(b.clientHeight, vh) / vh +
      Math.min(b.clientWidth, vw) / vw
    return bScore - aScore
  })
  return candidates[0]
}

function isWindowScrollElement(scrollEl: HTMLElement): boolean {
  return scrollEl === document.documentElement || scrollEl === document.body
}

function floatingMetrics(el: HTMLElement): FullpageFloatingMetrics {
  const style = getComputedStyle(el)
  const r = el.getBoundingClientRect()
  return {
    position: style.position,
    display: style.display,
    visibility: style.visibility,
    opacity: style.opacity,
    clientWidth: el.clientWidth,
    clientHeight: el.clientHeight,
    rectTop: r.top,
    rectBottom: r.bottom,
    rectLeft: r.left,
    rectRight: r.right,
    styleRight: style.right,
    styleTop: style.top,
    styleBottom: style.bottom,
    styleHeight: style.height,
    styleWidth: style.width,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    bodyClientWidth: document.body?.clientWidth ?? window.innerWidth,
  }
}

function hideElement(el: HTMLElement, restoreState: RestoreState): void {
  if (el.hasAttribute('data-assetvault-fullpage-hidden')) return
  restoreState.fixed.push({
    el,
    visibility: el.style.visibility,
    pointerEvents: el.style.pointerEvents,
    opacity: el.style.opacity,
  })
  el.setAttribute('data-assetvault-fullpage-hidden', '1')
  el.style.visibility = 'hidden'
  el.style.pointerEvents = 'none'
  el.style.opacity = '0'
}

function applyFloatingHides(restoreState: RestoreState, lastFrame: boolean): void {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
    const m = floatingMetrics(el)
    if (!shouldHideFullpageFloating(m, lastFrame)) continue
    hideElement(el, restoreState)
  }
}

function readScrollYCss(scrollEl: HTMLElement): number {
  if (isWindowScrollElement(scrollEl)) return Math.round(window.scrollY)
  return Math.round((scrollEl as HTMLElement & { scrollTop?: number }).scrollTop ?? 0)
}

function scrollToYCss(scrollEl: HTMLElement, yCss: number): void {
  const y = Math.max(0, Math.round(yCss))
  if (!isWindowScrollElement(scrollEl)) {
    scrollEl.scrollTo(0, y)
  } else {
    window.scrollTo(0, y)
  }
}

function readMetricsFromScrollEl(scrollEl: HTMLElement): Pick<FullpageSetupResult, 'scrollHeightCss' | 'viewportHeightCss'> {
  const viewportHeightCss = isWindowScrollElement(scrollEl) ? window.innerHeight : scrollEl.clientHeight
  return {
    scrollHeightCss: Math.max(0, scrollEl.scrollHeight),
    viewportHeightCss: clamp(viewportHeightCss, 1, 10_000_000),
  }
}

function setupFullpageCapture(): FullpageSetupResult {
  if ((window as unknown as Record<string, unknown>)[FLAG_RESTORE]) {
    restoreFullpageCapture()
  }

  const scrollEl = getMainScrollElement()
  ;(window as unknown as Record<string, unknown>)[FLAG_SCROLL_EL] = scrollEl

  const viewportHeightCss = isWindowScrollElement(scrollEl) ? window.innerHeight : scrollEl.clientHeight
  const scrollHeightCss = Math.max(0, scrollEl.scrollHeight)

  const restoreState: RestoreState = { fixed: [], videos: [], scrollTop: 0 }
  restoreState.scrollTop = readScrollYCss(scrollEl)

  applyFloatingHides(restoreState, false)

  for (const v of Array.from(document.querySelectorAll<HTMLVideoElement>('video'))) {
    if (v.paused) continue
    restoreState.videos.push({ v, shouldResume: true })
    try {
      v.pause()
    } catch {
      // ignore
    }
  }

  ;(window as unknown as Record<string, unknown>)[FLAG_RESTORE] = restoreState

  const onAbortKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') void chrome.runtime.sendMessage({ type: 'SCREENSHOT_ABORT' })
  }
  document.addEventListener('keydown', onAbortKey)
  ;(window as unknown as Record<string, unknown>)[FLAG_ABORT_KEY] = onAbortKey

  return {
    scrollHeightCss,
    viewportHeightCss: clamp(viewportHeightCss, 1, 10_000_000),
    innerWidthCss: window.innerWidth,
    dpr: window.devicePixelRatio || 1,
  }
}

function restoreFullpageCapture(): void {
  const onAbortKey = (window as unknown as Record<string, unknown>)[FLAG_ABORT_KEY] as
    | ((e: KeyboardEvent) => void)
    | undefined
  if (onAbortKey) {
    document.removeEventListener('keydown', onAbortKey)
    delete (window as unknown as Record<string, unknown>)[FLAG_ABORT_KEY]
  }

  const restoreState = (window as unknown as Record<string, unknown>)[FLAG_RESTORE] as RestoreState | undefined
  const scrollEl = (window as unknown as Record<string, unknown>)[FLAG_SCROLL_EL] as HTMLElement | undefined

  if (restoreState) {
    for (const f of restoreState.fixed) {
      try {
        f.el.style.visibility = f.visibility
        f.el.style.pointerEvents = f.pointerEvents
        f.el.style.opacity = f.opacity
        f.el.removeAttribute('data-assetvault-fullpage-hidden')
      } catch {
        // ignore
      }
    }
    for (const it of restoreState.videos) {
      if (!it.shouldResume) continue
      try {
        it.v.play().catch(() => null)
      } catch {
        // ignore
      }
    }
  }

  const scrollTop = restoreState?.scrollTop ?? 0
  if (scrollEl) {
    try {
      scrollToYCss(scrollEl, scrollTop)
    } catch {
      // ignore
    }
  }

  delete (window as unknown as Record<string, unknown>)[FLAG_RESTORE]
  delete (window as unknown as Record<string, unknown>)[FLAG_SCROLL_EL]
}

export type AssetVaultFullpageApi = {
  setup: () => FullpageSetupResult
  readScrollYCss: () => number
  readMetrics: () => Pick<FullpageSetupResult, 'scrollHeightCss' | 'viewportHeightCss'>
  scrollTo: (yCss: number) => void
  applyLastFrameFloatingHides: () => void
  restore: () => void
}

function installApi(): void {
  const g = globalThis as typeof globalThis & { __assetVaultFullpage?: AssetVaultFullpageApi }
  g.__assetVaultFullpage = {
    setup: setupFullpageCapture,
    readScrollYCss: () => {
      const scrollEl = (window as unknown as Record<string, unknown>)[FLAG_SCROLL_EL] as HTMLElement | undefined
      if (!scrollEl) return Math.round(window.scrollY)
      return readScrollYCss(scrollEl)
    },
    readMetrics: () => {
      const scrollEl = (window as unknown as Record<string, unknown>)[FLAG_SCROLL_EL] as HTMLElement | undefined
      if (!scrollEl) {
        return {
          scrollHeightCss: Math.max(0, document.documentElement.scrollHeight),
          viewportHeightCss: clamp(window.innerHeight, 1, 10_000_000),
        }
      }
      return readMetricsFromScrollEl(scrollEl)
    },
    scrollTo: (yCss: number) => {
      const scrollEl = (window as unknown as Record<string, unknown>)[FLAG_SCROLL_EL] as HTMLElement | undefined
      if (!scrollEl) {
        window.scrollTo(0, Math.max(0, Math.round(yCss)))
        return
      }
      scrollToYCss(scrollEl, yCss)
    },
    applyLastFrameFloatingHides: () => {
      const restoreState = (window as unknown as Record<string, unknown>)[FLAG_RESTORE] as RestoreState | undefined
      if (!restoreState) return
      applyFloatingHides(restoreState, true)
    },
    restore: restoreFullpageCapture,
  }
}

installApi()
