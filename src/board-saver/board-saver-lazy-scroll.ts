/** Lazy-load page auto-scroll for Board Saver. */

import { AutoScrollEngine } from '../shared/auto-scroll-engine'

export const LAZY_SCROLL_MAX_MS = 25_000

export type LazyScrollHandlers = {
  onTick: (percent: number) => void
  onBottomReached: () => void
  onMaxDuration: () => void
  shouldPause: () => boolean
}

export class BoardSaverLazyScroll {
  private engine: AutoScrollEngine | null = null
  private maxTimer: ReturnType<typeof setTimeout> | null = null

  get paused(): boolean {
    return this.engine?.getState() === 'paused'
  }

  get active(): boolean {
    const s = this.engine?.getState()
    return s === 'scrolling' || s === 'paused'
  }

  start(handlers: LazyScrollHandlers): void {
    this.stop()

    this.engine = new AutoScrollEngine({
      speed: 450,
      bottomThreshold: 100,
      checkInterval: 600,
      onTick: (prog) => {
        if (handlers.shouldPause()) {
          this.pause()
          return
        }
        handlers.onTick(prog.percent)
      },
      onBottomReached: () => {
        this.stop()
        handlers.onBottomReached()
      },
    })

    this.maxTimer = setTimeout(() => {
      if (this.engine && this.engine.getState() !== 'done') {
        handlers.onMaxDuration()
      }
    }, LAZY_SCROLL_MAX_MS)

    this.engine.start()
  }

  resume(): void {
    this.engine?.resume()
  }

  pause(): void {
    this.engine?.pause()
  }

  stop(): void {
    if (this.maxTimer) {
      clearTimeout(this.maxTimer)
      this.maxTimer = null
    }
    this.engine?.destroy()
    this.engine = null
  }
}
