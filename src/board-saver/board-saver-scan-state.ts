/** Page scan classification and post-import recovery (pure logic). */

export type PageType = 'unknown' | 'static' | 'lazy' | 'waterfall'
export type ScanPhase = 'idle' | 'scanning' | 'importing'

export type PostImportContext = {
  pageType: PageType
  scrollComplete: boolean
  /** True if a periodic scan timer was active when import started. */
  hadPeriodicTimer: boolean
}

export type PostImportAction =
  | { type: 'idle' }
  | { type: 'resume-periodic' }
  | { type: 'resume-lazy-scroll' }

/**
 * Decide how scanning should resume after a batch import completes.
 */
export function resolvePostImportAction(ctx: PostImportContext): PostImportAction {
  if (ctx.pageType === 'waterfall' || ctx.hadPeriodicTimer) {
    return { type: 'resume-periodic' }
  }
  if (ctx.pageType === 'lazy' && !ctx.scrollComplete) {
    return { type: 'resume-lazy-scroll' }
  }
  return { type: 'idle' }
}
