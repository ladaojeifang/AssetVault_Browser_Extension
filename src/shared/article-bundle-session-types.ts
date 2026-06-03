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

export interface ArticleBundleSessionFinishResult {
  assetId?: string
  warnings?: string[]
}

export interface ArticleBundleSessionAbortResult {
  success: boolean
}
