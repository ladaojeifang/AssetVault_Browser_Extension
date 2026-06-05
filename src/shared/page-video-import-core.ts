import type { PageVideoJob } from './page-video-import-types'
export function readPageVideoImportFeature(app: {
  features?: string[] | Record<string, boolean>
  limits?: { pageVideoImport?: unknown }
}): boolean | null {
  const f = app.features
  if (Array.isArray(f)) return f.includes('pageVideoImport')
  if (f && typeof f === 'object' && 'pageVideoImport' in f) {
    return Boolean((f as Record<string, boolean>).pageVideoImport)
  }
  if (app.limits?.pageVideoImport) return true
  return null
}

/** `true` = route exists; `false` = 404; `null` = inconclusive (network etc.). */
export function classifyPageVideoCapabilityProbeError(message: string): boolean | null {
  if (/JOB_NOT_FOUND/i.test(message)) return true
  if (/LIBRARY_NOT_READY|LIBRARY_NOT_OPEN/i.test(message)) return true
  if (/HTTP 404|Not Found/i.test(message)) return false
  return null
}

/** True when GET job response looks like the pageVideoImport jobs API (route exists). */
export function isPageVideoJobApiResponse(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false
  const o = data as Record<string, unknown>
  return typeof o.jobId === 'string' && typeof o.status === 'string'
}

export function isPageVideoJobTerminal(status: PageVideoJob['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

export type PageVideoPollDeps = {
  getJob: (jobId: string) => Promise<PageVideoJob>
  cancel: (jobId: string) => Promise<void>
  sleep: (ms: number) => Promise<void>
}

export const PAGE_VIDEO_JOB_MAX_POLL_MS = 3_600_000
export const PAGE_VIDEO_POLL_INTERVAL_MS = 1_500

export async function pollPageVideoJobUntilDone(
  jobId: string,
  opts: {
    deps: PageVideoPollDeps
    onProgress?: (job: PageVideoJob) => void
    signal?: AbortSignal
    maxMs?: number
  }
): Promise<PageVideoJob> {
  const deps = opts.deps
  const started = Date.now()
  const maxMs = opts?.maxMs ?? PAGE_VIDEO_JOB_MAX_POLL_MS
  let interval = PAGE_VIDEO_POLL_INTERVAL_MS

  while (true) {
    if (opts?.signal?.aborted) {
      try {
        await deps.cancel(jobId)
      } catch {
        /* job may already be done */
      }
      throw new Error('JOB_CANCELLED: 已取消')
    }

    const job = await deps.getJob(jobId)
    opts?.onProgress?.(job)

    if (isPageVideoJobTerminal(job.status)) return job

    if (Date.now() - started > maxMs) {
      try {
        await deps.cancel(jobId)
      } catch {
        /* ignore */
      }
      throw new Error('YTDLP_STALLED: 等待 Pro 下载超时')
    }

    interval = job.pollAfterMs ?? interval
    await deps.sleep(interval)
  }
}
