import type { CollectMeta, MediaCandidate, PageMediaItem } from './types'

export type BgMessage =
  | { type: 'PING_API' }
  | { type: 'IMPORT_META'; meta: CollectMeta; tagIds?: string[] }
  | {
      type: 'IMPORT_BATCH'
      items: Array<{ url: string; filename?: string; headers?: Record<string, string> }>
      tagIds?: string[]
      sourceUrl?: string
      duplicatePolicy?: 'use_existing' | 'import_copy'
    }
  | {
      type: 'SCREENSHOT_CROP_RECT'
      mode: 'region' | 'element'
      rect: { x: number; y: number; width: number; height: number }
      dpr: number
      format?: 'jpeg' | 'png'
    }
  | { type: 'SCREENSHOT_FULLPAGE'; format?: 'jpeg' | 'png' }
  | { type: 'SCREENSHOT_ABORT' }
  | { type: 'FULLPAGE_CAPTURE_DONE'; tabId: number; ok: boolean; error?: string }
  | { type: 'RESOLVE_VIDEO_CANDIDATES' }
  | { type: 'RESCAN_PAGE_MEDIA'; tabId?: number; pageUrl?: string }
  | { type: 'IMPORT_MEDIA_CANDIDATE_BATCH'
      items: Array<{
        url: string
        filename?: string
        headers?: Record<string, string>
      }>
    }
  | { type: 'EXPORT_PAGE_MARKDOWN', tabId?: number }
  | { type: 'EXPORT_PAGE_MARKDOWN_ABORT', tabId?: number }
  | { type: 'IMPORT_PAGE_VIDEO'; url?: string; tabId?: number; cookieHeader?: string }
  | {
      type: 'IMPORT_PAGE_VIDEO_BATCH'
      items: Array<{ url: string; platform?: string; pageTitle?: string }>
      tabId?: number
    }
  | { type: 'IMPORT_PAGE_VIDEO_ABORT'; jobId: string }
  | { type: 'GET_PAGE_VIDEO_CAPABILITIES'; tabId?: number }
  | { type: 'IMPORT_PAGE_VIDEO_FROM_TEXT'; lines: string[]; tabId?: number }

export type BgResponse =
  | {
      ok: true
      app?: { name: string; version: string }
      assetId?: string
      skipped?: boolean
      batch?: unknown
      started?: boolean
      items?: PageMediaItem[]
      pageTitle?: string
      pageUrl?: string
      sourceTabId?: number
      candidates?: MediaCandidate[]
      pageVideo?: {
        apiSupported: boolean
        isVideoPage: boolean
        platform: string | null
        canonicalUrl: string | null
        proVersion?: string
        ytdlpVersion?: string | null
      }
      jobId?: string
      succeeded?: number
      failed?: number
      skippedCount?: number
      batchId?: string
      invalidLineCount?: number
    }
  | { ok: false; error: string }

export type ContentMessage =
  | { type: 'CONTENT_PING' }
  | { type: 'SCAN_PAGE_MEDIA' }
  | { type: 'SCAN_PAGE_MEDIA_DEEP' }
  | { type: 'RESOLVE_VIDEO_CANDIDATES' }
  | { type: 'START_PAGE_OBSERVER' }
  | { type: 'SAVE_TARGET'; target?: EventTarget }
  | { type: 'SCREENSHOT_UI_START'; mode: 'region' | 'element' }
  | { type: 'RESOLVE_HD_IMAGE' }
  | { type: 'OPEN_BOARD_SAVER' }
  | { type: 'PAGE_VIDEO_CONTEXT' }

export type HdImageResolvePayload = {
  candidates: Array<{ url: string; source: string }>
  referer: string
  pageTitle: string
  pageUrl: string
}

export type ContentResponse =
  | {
      ok: true
      items?: PageMediaItem[]
      candidates?: MediaCandidate[]
      meta?: CollectMeta
      hd?: HdImageResolvePayload
      context?: { url: string; platform: string; isVideoPage: true } | null
    }
  | { ok: false; error: string }

export const BATCH_DRAFT_KEY = 'assetvaultBatchDraft'
