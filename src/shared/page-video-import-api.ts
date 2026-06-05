import { apiRequest, pingApp } from './api'
import {
  classifyPageVideoCapabilityProbeError,
  isPageVideoJobApiResponse,
  pollPageVideoJobUntilDone as pollPageVideoJobCore,
  readPageVideoImportFeature,
  PAGE_VIDEO_JOB_MAX_POLL_MS,
  PAGE_VIDEO_POLL_INTERVAL_MS,
  type PageVideoPollDeps
} from './page-video-import-core'
import type {
  PageVideoBatchCreateResult,
  PageVideoBatchGetResult,
  PageVideoCreateBody,
  PageVideoCreateResult,
  PageVideoJob
} from './page-video-import-types'

export {
  classifyPageVideoCapabilityProbeError,
  isPageVideoJobApiResponse,
  isPageVideoJobTerminal,
  readPageVideoImportFeature,
  PAGE_VIDEO_JOB_MAX_POLL_MS,
  PAGE_VIDEO_POLL_INTERVAL_MS,
  type PageVideoPollDeps
} from './page-video-import-core'
export { summarizePageVideoJob } from './page-video-import-errors'

export const PAGE_VIDEO_CREATE_TIMEOUT_MS = 15_000
export const PAGE_VIDEO_BATCH_TIMEOUT_MS = 30_000
export const PAGE_VIDEO_POLL_TIMEOUT_MS = 10_000

const CAPABILITY_PROBE_JOB_ID = 'pvi___capability_probe___'
const SUPPORT_CACHE_MS = 5 * 60 * 1000

let cachedSupport: boolean | null = null
let cachedSupportAt = 0

type AppInfo = Awaited<ReturnType<typeof pingApp>> & {
  features?: string[] | Record<string, boolean>
  ytdlp?: { version?: string | null; ffmpegPresent?: boolean }
}

export function resetPageVideoImportSupportCache(): void {
  cachedSupport = null
  cachedSupportAt = 0
}

export async function supportsPageVideoImportApi(): Promise<boolean> {
  const now = Date.now()
  if (cachedSupport !== null && now - cachedSupportAt < SUPPORT_CACHE_MS) {
    return cachedSupport
  }

  try {
    const app = (await pingApp()) as AppInfo
    const fromFeatures = readPageVideoImportFeature(app)
    if (fromFeatures === true) {
      cachedSupport = true
      cachedSupportAt = now
      return true
    }
    if (fromFeatures === false) {
      cachedSupport = false
      cachedSupportAt = now
      return false
    }

    try {
      const body = await apiRequest<unknown>(
        `/asset/pageVideoImport/jobs/${CAPABILITY_PROBE_JOB_ID}`,
        { method: 'GET', timeoutMs: 8000 }
      )
      // Route exists if API returns a job-shaped body or rejects with JOB_NOT_FOUND.
      cachedSupport = isPageVideoJobApiResponse(body)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const probe = classifyPageVideoCapabilityProbeError(msg)
      if (probe === true) {
        cachedSupport = true
        cachedSupportAt = now
        return true
      }
      if (probe === false) {
        cachedSupport = false
        cachedSupportAt = now
        return false
      }
      return cachedSupport === true
    }
  } catch {
    return cachedSupport === true
  }

  if (cachedSupport !== null) cachedSupportAt = now
  return cachedSupport === true
}

export async function pageVideoImportCreate(
  body: PageVideoCreateBody
): Promise<PageVideoCreateResult> {
  return apiRequest('/asset/pageVideoImport', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeoutMs: PAGE_VIDEO_CREATE_TIMEOUT_MS
  })
}

export async function pageVideoImportBatch(body: {
  items: PageVideoCreateBody[]
  targetFolderId?: string | null
  duplicatePolicy?: PageVideoCreateBody['duplicatePolicy']
  format?: string
  formatPreset?: PageVideoCreateBody['formatPreset']
  cookiesFromBrowser?: PageVideoCreateBody['cookiesFromBrowser']
  options?: { stopOnError?: boolean }
}): Promise<PageVideoBatchCreateResult> {
  return apiRequest('/asset/pageVideoImport/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeoutMs: PAGE_VIDEO_BATCH_TIMEOUT_MS
  })
}

export async function pageVideoImportGetBatch(batchId: string): Promise<PageVideoBatchGetResult> {
  return apiRequest(`/asset/pageVideoImport/batch/${encodeURIComponent(batchId)}`, {
    method: 'GET',
    timeoutMs: PAGE_VIDEO_POLL_TIMEOUT_MS
  })
}

export async function pageVideoImportGetJob(jobId: string): Promise<PageVideoJob> {
  return apiRequest(`/asset/pageVideoImport/jobs/${encodeURIComponent(jobId)}`, {
    method: 'GET',
    timeoutMs: PAGE_VIDEO_POLL_TIMEOUT_MS
  })
}

export async function pageVideoImportCancel(jobId: string): Promise<void> {
  await apiRequest(`/asset/pageVideoImport/jobs/${encodeURIComponent(jobId)}`, {
    method: 'DELETE',
    timeoutMs: 20_000
  })
}

const defaultPollDeps: PageVideoPollDeps = {
  getJob: pageVideoImportGetJob,
  cancel: pageVideoImportCancel,
  sleep
}

export async function pollPageVideoJobUntilDone(
  jobId: string,
  opts?: {
    onProgress?: (job: PageVideoJob) => void
    signal?: AbortSignal
    maxMs?: number
    deps?: PageVideoPollDeps
  }
): Promise<PageVideoJob> {
  return pollPageVideoJobCore(jobId, {
    ...opts,
    deps: opts?.deps ?? defaultPollDeps
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
