export interface ArticleBundleSessionStartResult {
  sessionId: string
  tempDir: string
  limits?: {
    maxFileBytes?: number
    maxFiles?: number
  }
}

export interface ArticleBundleSessionAppendResult {
  sessionId: string
  filesReceived: number
  sessionBytes: number
}

export type ArticleBundleFinishWarning =
  | string
  | { code: string; relativePath?: string; message: string }

export interface ArticleBundleSessionFinishResult {
  assetId?: string
  skipped?: boolean
  storagePath?: string | null
  warnings?: ArticleBundleFinishWarning[]
}

export interface ArticleBundleSessionAbortResult {
  success: boolean
}
