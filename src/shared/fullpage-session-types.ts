/** Mirrors AssetVault Pro `fullPageSession` API response shapes (extension-side). */

export type FullPageSessionLimits = {
  maxStrips: number
  maxStripBytes: number
  maxSessionBytes: number
  appendTimeoutMs: number
  finishTimeoutMs: number
}

export type FullPageSessionStartResult = {
  sessionId: string
  tempDir: string
  limits: FullPageSessionLimits
  expiresAt: string
}

export type FullPageSessionAppendResult = {
  sessionId: string
  stripIndex: number
  stripsReceived: number
  sessionBytes: number
  expiresAt: string
}

export type FullPageSessionFinishResult = {
  assetId: string
  skipped: boolean
  existingAssetId: string | null
  output: {
    widthPx: number
    heightPx: number
    format: 'jpeg' | 'png'
    fileBytes: number
    scaledDown: boolean
  }
  stripsUsed: number
  warnings: string[]
  timingMs?: { stitch?: number; import?: number }
  /** Present when finish did not delete the session directory. */
  tempDir?: string | null
  stripsPreserved?: boolean
  /** Local paths to strip-0000.jpg … when preserved. */
  stripFiles?: string[]
}

export type FullPageSessionImportResult = FullPageSessionFinishResult & {
  sessionId: string
  tempDir: string
  /** Extension-only backup path (Pro never deletes `_kept/`). */
  keptStripDir?: string | null
  stripsPreserved: boolean
}

export type FullPageSessionAbortResult = {
  sessionId: string
  aborted: boolean
  filesRemoved: number
}
