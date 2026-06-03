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
  | {
      type: 'IMPORT_MEDIA_CANDIDATE_BATCH'
      items: Array<{
        url: string
        filename?: string
        headers?: Record<string, string>
      }>
    }

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
    }
  | { ok: false; error: string }

export const BATCH_DRAFT_KEY = 'assetvaultBatchDraft'
