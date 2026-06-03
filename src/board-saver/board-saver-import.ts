/** Batch import response parsing for Board Saver. */

export type BatchImportAggregate = {
  imported: number
  skippedUrls: string[]
  errorUrls: string[]
}

export function createBatchImportAggregate(): BatchImportAggregate {
  return { imported: 0, skippedUrls: [], errorUrls: [] }
}

/** Returns true when the background worker accepted the batch. */
export function accumulateBatchResponse(resp: unknown, acc: BatchImportAggregate): boolean {
  if (!resp || typeof resp !== 'object' || !('ok' in resp)) return false
  if (!(resp as { ok: boolean }).ok) return false

  const batch = (resp as {
    batch?: {
      imported?: string[]
      skipped?: Array<{ url: string }>
      errors?: Array<{ url: string }>
    }
  }).batch

  if (batch) {
    acc.imported += batch.imported?.length ?? 0
    for (const s of batch.skipped ?? []) acc.skippedUrls.push(s.url)
    for (const e of batch.errors ?? []) acc.errorUrls.push(e.url)
  }
  return true
}

export function formatImportSummary(acc: BatchImportAggregate): string {
  let summary = `完成！成功 ${acc.imported}`
  if (acc.skippedUrls.length) summary += `，跳过 ${acc.skippedUrls.length}`
  if (acc.errorUrls.length) summary += `，失败 ${acc.errorUrls.length}`
  return summary
}

/** True when at least one asset was imported (partial success counts). */
export function hasImportedAssets(acc: BatchImportAggregate): boolean {
  return acc.imported > 0
}

export function truncateImportUrl(url: string): string {
  return url.length > 80 ? `${url.slice(0, 78)}…` : url
}
