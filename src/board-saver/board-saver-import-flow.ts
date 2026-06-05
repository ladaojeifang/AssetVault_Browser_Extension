/** Batch import orchestration for Board Saver (chrome.runtime messaging). */

import {
  accumulateBatchResponse,
  createBatchImportAggregate,
  type BatchImportAggregate,
} from './board-saver-import'

export type BoardSaverImportPayloadItem = {
  url: string
  filename?: string
  referer?: string
}

export type BatchImportCallbacks = {
  onProgress: (done: number, total: number) => void
  onRetry: (retry: number, maxRetries: number) => void
}

export type BatchImportFlowResult =
  | { ok: true; aggregate: BatchImportAggregate }
  | { ok: false; aggregate: BatchImportAggregate; error: string }

const DEFAULT_BATCH_SIZE = 10
const DEFAULT_MAX_RETRIES = 2

function markBatchFailed(batch: BoardSaverImportPayloadItem[], aggregate: BatchImportAggregate): void {
  for (const item of batch) aggregate.errorUrls.push(item.url)
}

export async function runBoardSaverBatchImport(
  items: BoardSaverImportPayloadItem[],
  sourceUrl: string,
  callbacks: BatchImportCallbacks,
  options?: { batchSize?: number; maxRetries?: number },
): Promise<BatchImportFlowResult> {
  const batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES
  const aggregate = createBatchImportAggregate()
  let totalDone = 0
  let lastError = ''

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const count = Math.min(i + batchSize, items.length)
    callbacks.onProgress(count, items.length)

    let retries = 0
    let ok = false
    while (retries <= maxRetries) {
      try {
        const resp = await chrome.runtime.sendMessage({
          type: 'IMPORT_BATCH',
          items: batch.map((item) => ({
            url: item.url,
            filename: item.filename,
            headers: item.referer ? { Referer: item.referer } : undefined,
          })),
          sourceUrl,
          duplicatePolicy: 'import_copy',
        })
        if (accumulateBatchResponse(resp, aggregate)) {
          ok = true
          totalDone += batch.length
          console.log(`[BoardSaver] batch done: ${totalDone}/${items.length}`)
          break
        }
        const err = (resp as { error?: string })?.error ?? '未知错误'
        lastError = err
        if (!err.includes('超时')) {
          markBatchFailed(batch, aggregate)
          console.warn(`[BoardSaver] batch failed (${count}/${items.length}): ${err}`)
          ok = true
          break
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        lastError = msg
        if (!msg.includes('超时') && !msg.includes('Receiving end')) {
          markBatchFailed(batch, aggregate)
          console.warn(`[BoardSaver] batch error (${count}/${items.length}): ${msg}`)
          ok = true
          break
        }
      }
      retries++
      if (retries <= maxRetries) {
        callbacks.onRetry(retries, maxRetries)
        await new Promise((r) => setTimeout(r, 2000))
      }
    }
    if (!ok) {
      markBatchFailed(batch, aggregate)
      lastError = lastError || `导入中断: 连续超时 (${count}/${items.length})`
      console.warn(`[BoardSaver] ${lastError}`)
    }
  }

  if (aggregate.imported > 0) {
    return { ok: true, aggregate }
  }
  return { ok: false, aggregate, error: lastError || '导入失败' }
}

export type VideoPageBatchImportResult =
  | { ok: true; succeeded: number; failed: number }
  | { ok: false; error: string }

export async function runBoardSaverVideoPageImport(
  items: Array<{ url: string; platform?: string; pageTitle?: string }>,
): Promise<VideoPageBatchImportResult> {
  if (!items.length) {
    return { ok: false, error: '没有可提交的视频作品' }
  }
  try {
    const resp = (await chrome.runtime.sendMessage({
      type: 'IMPORT_PAGE_VIDEO_BATCH',
      items,
    })) as VideoPageBatchImportResult & { ok?: boolean; error?: string }
    if (resp?.ok && 'succeeded' in resp) {
      return { ok: true, succeeded: resp.succeeded, failed: resp.failed }
    }
    return { ok: false, error: resp?.error ?? '视频批量导入失败' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
