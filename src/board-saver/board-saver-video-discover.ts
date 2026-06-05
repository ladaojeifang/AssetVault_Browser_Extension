/** Discover canonical video作品页 links on the current page for Board Saver. */

import { resolveVideoPageContext } from '../shared/video-page-url-rules'
import type { BoardSaverItem } from './board-saver-types'
import { extractBoardSaverDomain } from './board-saver-utils'

const MAX_LINKS_PER_SCAN = 800

export type VideoDiscoverOptions = {
  pageUrl: string
  pageTitle: string
  seenUrls: Set<string>
  totalItems: number
  maxItems: number
  nextId: () => string
}

export type VideoDiscoverResult = {
  newItems: BoardSaverItem[]
  totalItems: number
}

/** Pure: map href strings to new `video_page` items (for unit tests). */
export function videoPageItemsFromHrefs(
  hrefs: string[],
  opts: Pick<VideoDiscoverOptions, 'pageTitle' | 'seenUrls' | 'totalItems' | 'maxItems' | 'nextId'>,
): VideoDiscoverResult {
  let totalItems = opts.totalItems
  const newItems: BoardSaverItem[] = []

  for (const raw of hrefs) {
    if (totalItems >= opts.maxItems) break
    const ctx = resolveVideoPageContext(raw)
    if (!ctx) continue
    if (opts.seenUrls.has(ctx.url)) continue
    opts.seenUrls.add(ctx.url)
    totalItems++
    newItems.push({
      id: opts.nextId(),
      url: ctx.url,
      filename: `${ctx.platform} 视频`,
      domain: extractBoardSaverDomain(ctx.url),
      selected: false,
      discoveredAt: Date.now(),
      source: 'video-link',
      isEnlarged: false,
      kind: 'video_page',
      platform: ctx.platform,
    })
  }

  return { newItems, totalItems }
}

export function collectBoardSaverVideoPages(opts: VideoDiscoverOptions): VideoDiscoverResult {
  const hrefs: string[] = []
  if (opts.pageUrl) hrefs.push(opts.pageUrl)

  const anchors = document.querySelectorAll('a[href]')
  const limit = Math.min(anchors.length, MAX_LINKS_PER_SCAN)
  for (let i = 0; i < limit; i++) {
    const el = anchors[i] as HTMLAnchorElement
    if (el.href) hrefs.push(el.href)
  }

  return videoPageItemsFromHrefs(hrefs, opts)
}
