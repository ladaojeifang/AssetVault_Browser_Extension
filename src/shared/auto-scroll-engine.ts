/**
 * Auto-scroll engine for waterfall / infinite-scroll pages.
 * Uses requestAnimationFrame for smooth scrolling with configurable speed.
 */

export type ScrollState = 'idle' | 'scrolling' | 'paused' | 'done'

export type AutoScrollOptions = {
  /** Pixels per second (default: 300) */
  speed?: number
  /** Margin from bottom to consider "at bottom" (default: 200) */
  bottomThreshold?: number
  /** Interval between scroll position checks in ms (default: 100) */
  checkInterval?: number
  /** Called when bottom of page is reached */
  onBottomReached?: () => void
  /** Called on each scroll tick with current scroll info */
  onTick?: (info: { scrollTop: number; scrollHeight: number; percent: number }) => void
}

export type ScrollProgress = {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  percent: number
}

const DEFAULT_SPEED = 300 // px/s
const DEFAULT_BOTTOM_THRESHOLD = 200
const DEFAULT_CHECK_INTERVAL = 100

export class AutoScrollEngine {
  private _state: ScrollState = 'idle'
  private _speed: number
  private _bottomThreshold: number
  private _checkInterval: number
  private _onBottomReached?: () => void
  private _onTick?: (info: ScrollProgress) => void

  private _rafId: number | null = null
  private _lastTimestamp: number = 0
  private _checkTimerId: ReturnType<typeof setInterval> | null = null
  private _bottomDetected = false
  private _destroyed = false

  constructor(options: AutoScrollOptions = {}) {
    this._speed = options.speed ?? DEFAULT_SPEED
    this._bottomThreshold = options.bottomThreshold ?? DEFAULT_BOTTOM_THRESHOLD
    this._checkInterval = options.checkInterval ?? DEFAULT_CHECK_INTERVAL
    this._onBottomReached = options.onBottomReached
    this._onTick = options.onTick
  }

  get state(): ScrollState {
    return this._state
  }

  get destroyed(): boolean {
    return this._destroyed
  }

  /**
   * Start auto-scrolling.
   * If already scrolling or paused, this is a no-op — use resume() to continue after pause.
   */
  start(): void {
    if (this._destroyed) return
    if (this._state === 'scrolling') return
    this._bottomDetected = false
    this._state = 'scrolling'
    this._lastTimestamp = performance.now()
    this._startRafLoop()
    this._startCheckTimer()
  }

  /** Pause scrolling without resetting state. */
  pause(): void {
    if (this._state !== 'scrolling') return
    this._state = 'paused'
    this._stopRafLoop()
  }

  /** Resume scrolling after a pause. */
  resume(): void {
    if (this._state !== 'paused') return
    this._state = 'scrolling'
    this._lastTimestamp = performance.now()
    this._startRafLoop()
  }

  /** Fully stop and reset to idle. */
  stop(): void {
    this._state = 'idle'
    this._stopRafLoop()
    this._stopCheckTimer()
    this._bottomDetected = false
  }

  /** Get the current scroll progress information. */
  getProgress(): ScrollProgress {
    const scrollTop = window.scrollY || document.documentElement.scrollTop || 0
    const clientHeight =
      window.innerHeight || document.documentElement.clientHeight || 0
    const scrollHeight = document.documentElement.scrollHeight || 0
    const maxScroll = scrollHeight - clientHeight
    const percent = maxScroll > 0 ? Math.min(1, Math.max(0, scrollTop / maxScroll)) : 0
    return { scrollTop, scrollHeight, clientHeight, percent }
  }

  /** Get current state string. */
  getState(): ScrollState {
    return this._state
  }

  /**
   * Toggle between scrolling and paused.
   * If idle, starts scrolling. If done, restarts.
   */
  toggle(): void {
    switch (this._state) {
      case 'idle':
      case 'done':
        this.start()
        break
      case 'scrolling':
        this.pause()
        break
      case 'paused':
        this.resume()
        break
    }
  }

  /**
   * Clean up all resources. After calling destroy(), the engine cannot be reused.
   */
  destroy(): void {
    this.stop()
    this._destroyed = true
    this._onBottomReached = undefined
    this._onTick = undefined
  }

  // ── Private ──────────────────────────────────────────────────────────

  private _startRafLoop(): void {
    if (this._destroyed || this._rafId !== null) return
    const loop = (now: number) => {
      if (this._destroyed || this._state !== 'scrolling') {
        this._rafId = null
        return
      }
      const deltaMs = now - this._lastTimestamp
      this._lastTimestamp = now
      if (deltaMs > 0 && deltaMs < 500) {
        // clamp delta to avoid huge jumps when tab was backgrounded
        const deltaSec = Math.min(deltaMs / 1000, 0.1)
        const px = this._speed * deltaSec
        window.scrollBy({ top: px, behavior: 'instant' })
      }
      this._rafId = requestAnimationFrame(loop)
    }
    this._rafId = requestAnimationFrame(loop)
  }

  private _stopRafLoop(): void {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId)
      this._rafId = null
    }
  }

  private _startCheckTimer(): void {
    if (this._destroyed || this._checkTimerId !== null) return
    this._checkTimerId = setInterval(() => {
      if (this._destroyed) {
        this._stopCheckTimer()
        return
      }
      const prog = this.getProgress()
      this._onTick?.(prog)

      if (
        !this._bottomDetected &&
        prog.scrollTop + prog.clientHeight >=
          prog.scrollHeight - this._bottomThreshold
      ) {
        this._bottomDetected = true
        this._state = 'done'
        this._stopRafLoop()
        try {
          this._onBottomReached?.()
        } catch {
          /* ignore user callback errors */
        }
      }
    }, this._checkInterval)
  }

  private _stopCheckTimer(): void {
    if (this._checkTimerId !== null) {
      clearInterval(this._checkTimerId)
      this._checkTimerId = null
    }
  }
}
