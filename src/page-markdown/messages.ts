import type { MediaItem } from './extract/media-inventory'

export interface PageMdExtractRequest {
  type: 'PAGE_MD_EXTRACT'
  // config later
}

export interface PageMdExtractResponse {
  title: string
  sourceUrl: string
  markdownDraft: string
  media: MediaItem[]
  ruleId?: string
  /** Main column selector used during extract (for in-page image capture). */
  mainColumnSelector?: string
}

export interface ExportPageMarkdownRequest {
  type: 'EXPORT_PAGE_MARKDOWN'
  tabId?: number
  // from popup/contextMenu
}

export interface ExportPageMarkdownAbortRequest {
  type: 'EXPORT_PAGE_MARKDOWN_ABORT'
  tabId?: number
}
