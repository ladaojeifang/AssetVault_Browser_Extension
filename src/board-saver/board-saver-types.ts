/** Shared types for board-saver (window + bridge) */

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
}

export const BATCH_IMPORT_SIZE = 20
export const SCAN_INTERVAL_MS = 500
export const MAX_ITEMS = 2000
