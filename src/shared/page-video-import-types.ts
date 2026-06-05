export type PageVideoJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

import type { PageVideoFormatPreset } from './page-video-format-presets'

export type PageVideoCookiesBrowser = 'edge' | 'chrome' | 'firefox' | 'none'

export type PageVideoCreateBody = {
  url: string
  platform?: string
  targetFolderId?: string | null
  duplicatePolicy?: 'import_copy' | 'use_existing' | 'replace'
  format?: string
  formatPreset?: PageVideoFormatPreset
  cookiesFromBrowser?: PageVideoCookiesBrowser
  /** Raw `Cookie` header value (no `Cookie:` prefix); Pro passes to yt-dlp `--add-header`. */
  cookieHeader?: string
  sourceMeta?: {
    pageUrl?: string
    pageTitle?: string
    submittedBy?: string
    tabId?: number
  }
  options?: {
    writeSubs?: boolean
    subtitleLangs?: string[]
    noPlaylist?: boolean
  }
}

export type PageVideoJobError = {
  code: string
  message: string
  detail?: string
}

export type PageVideoJob = {
  jobId: string
  batchId?: string | null
  status: PageVideoJobStatus
  stage?: string | null
  progressPercent?: number | null
  url: string
  platform?: string
  assetId?: string | null
  skipped?: boolean
  existingAssetId?: string | null
  error?: PageVideoJobError | null
  warnings?: string[]
  output?: {
    filename?: string
    fileBytes?: number
    durationSec?: number
    width?: number
    height?: number
  }
  pollAfterMs?: number
  createdAt?: string
  completedAt?: string | null
}

export type PageVideoCreateResult = {
  jobId: string
  status: PageVideoJobStatus
  queuePosition?: number
  url: string
  createdAt?: string
  pollAfterMs?: number
}

export type PageVideoBatchStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cancelled'

export type PageVideoBatchCreateResult = {
  batchId: string
  jobs: Array<{ jobId: string; url: string; status: PageVideoJobStatus }>
  total: number
  createdAt?: string
}

export type PageVideoBatchGetResult = {
  batchId: string
  status: PageVideoBatchStatus
  jobs: PageVideoJob[]
  total: number
  queued: number
  running: number
  completed: number
  failed: number
  cancelled: number
}

export type PageVideoCapabilities = {
  supported: boolean
  isVideoPage: boolean
  platform: string | null
  canonicalUrl: string | null
  proVersion?: string
  ytdlpVersion?: string | null
}
