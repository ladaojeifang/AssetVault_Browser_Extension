/** Shared types for board-saver (window + bridge) */

export type BoardSaverItemKind = 'image' | 'video_page'

export type BoardSaverItem = {
  id: string
  url: string
  filename?: string
  domain: string
  width?: number
  height?: number
  selected: boolean
  discoveredAt: number
  source: string
  /** True if enlargeImageUrl returned a different URL (HD version). */
  isEnlarged: boolean
  /** Default `image`; `video_page` = canonical作品页 URL for Pro yt-dlp. */
  kind?: BoardSaverItemKind
  /** Video platform id when `kind === 'video_page'`. */
  platform?: string
}

export const BATCH_IMPORT_SIZE = 20
export const SCAN_INTERVAL_MS = 500
export const MAX_ITEMS = 2000
