import {
  createDownloadUrlForBlob,
  ensureOffscreenDocument,
  revokeBlobObjectUrl
} from './offscreen-blob'

const DEFAULT_DOWNLOAD_TIMEOUT_MS = 90_000

export function normalizeDownloadRelativePath(filename: string): string {
  return filename.replace(/\\/g, '/')
}

function assertDownloadsApi(): void {
  if (typeof chrome.downloads?.download !== 'function') {
    throw new Error('扩展缺少 downloads 权限：请从 dist/ 目录重新加载扩展')
  }
}

type PendingDownloadPath = {
  filename: string
  conflictAction: chrome.downloads.FilenameConflictAction
}

/** blob:/data: 下载时 Chrome 常忽略 download.filename，需用 onDeterminingFilename 强制子目录。 */
const pendingByUrl = new Map<string, PendingDownloadPath>()
const pendingById = new Map<number, PendingDownloadPath>()

let downloadFilenameHookReady = false

/**
 * Register once in the service worker. Call from background startup.
 */
export function ensureExtensionDownloadFilenameHook(): void {
  if (downloadFilenameHookReady) return
  const add = chrome.downloads?.onDeterminingFilename?.addListener
  if (typeof add !== 'function') return
  downloadFilenameHookReady = true

  chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
    if (downloadItem.byExtensionId !== chrome.runtime.id) return

    const entry =
      (downloadItem.url ? pendingByUrl.get(downloadItem.url) : undefined) ??
      (downloadItem.id != null ? pendingById.get(downloadItem.id) : undefined)
    if (!entry) return

    suggest({
      filename: entry.filename,
      conflictAction: entry.conflictAction
    })
  })
}

function trackPendingDownload(
  url: string,
  filename: string,
  conflictAction: chrome.downloads.FilenameConflictAction
): void {
  pendingByUrl.set(url, { filename, conflictAction })
}

function untrackPendingDownload(url: string, downloadId?: number): void {
  pendingByUrl.delete(url)
  if (downloadId != null) pendingById.delete(downloadId)
}

export function assertSavedUnderRelativeDir(filePath: string, relativeFilename: string): void {
  const normPath = filePath.replace(/\\/g, '/').toLowerCase()
  const parts = normalizeDownloadRelativePath(relativeFilename).split('/').filter(Boolean)
  if (parts.length < 2) return
  for (const seg of parts.slice(0, -1)) {
    if (!normPath.includes(seg.toLowerCase())) {
      throw new Error(
        `下载位置不正确（期望路径含 ${parts.slice(0, -1).join('/')}，实际: ${filePath}）。` +
          ' 请重新加载扩展；若仍失败，检查 Chrome 是否允许扩展指定下载子目录。'
      )
    }
  }
}

export async function waitForChromeDownload(args: {
  url: string
  filename: string
  conflictAction?: chrome.downloads.FilenameConflictAction
  timeoutMs?: number
}): Promise<{ filePath: string; downloadId: number }> {
  assertDownloadsApi()
  ensureExtensionDownloadFilenameHook()

  const filename = normalizeDownloadRelativePath(args.filename)
  const conflictAction = args.conflictAction ?? 'uniquify'
  const timeoutMs = args.timeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS

  trackPendingDownload(args.url, filename, conflictAction)

  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url: args.url,
        filename,
        saveAs: false,
        conflictAction,
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          untrackPendingDownload(args.url)
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        if (downloadId === undefined) {
          untrackPendingDownload(args.url)
          reject(new Error('Download failed to start'))
          return
        }

        const entry = pendingByUrl.get(args.url)
        if (entry) pendingById.set(downloadId, entry)

        let settled = false
        const teardown = (listener: (delta: chrome.downloads.DownloadDelta) => void) => {
          clearTimeout(timeoutId)
          chrome.downloads.onChanged.removeListener(listener)
          untrackPendingDownload(args.url, downloadId)
        }
        const finish = (
          listener: (delta: chrome.downloads.DownloadDelta) => void,
          fn: () => void
        ) => {
          if (settled) return
          settled = true
          teardown(listener)
          fn()
        }

        const onChanged = (delta: chrome.downloads.DownloadDelta) => {
          if (delta.id !== downloadId) return

          if (delta.state?.current === 'complete') {
            finish(onChanged, () => {
              chrome.downloads.search({ id: downloadId }, (results) => {
                if (!results?.length || !results[0].filename) {
                  reject(new Error('Failed to find downloaded file'))
                  return
                }
                resolve({ filePath: results[0].filename, downloadId })
              })
            })
            return
          }

          if (delta.state?.current === 'interrupted' || delta.error) {
            finish(onChanged, () => {
              reject(
                new Error(
                  delta.error?.current
                    ? `Download failed: ${delta.error.current}`
                    : 'Download interrupted'
                )
              )
            })
          }
        }

        const timeoutId = setTimeout(() => {
          finish(onChanged, () => reject(new Error('文件保存超时')))
        }, timeoutMs)

        chrome.downloads.onChanged.addListener(onChanged)
      }
    )
  })
}

async function downloadViaBlobUrl(
  blob: Blob,
  rel: string,
  conflictAction: chrome.downloads.FilenameConflictAction
): Promise<{ filePath: string; downloadId: number }> {
  const handle = await createDownloadUrlForBlob(blob)
  try {
    const result = await waitForChromeDownload({
      url: handle.url,
      filename: rel,
      conflictAction
    })
    assertSavedUnderRelativeDir(result.filePath, rel)
    return result
  } finally {
    // Let Chrome finish reading the blob URL before revoke (avoids 0-byte files).
    await new Promise((r) => setTimeout(r, 400))
    await handle.revoke()
  }
}

export async function downloadBlobToRelativeFilename(
  blob: Blob,
  filename: string,
  conflictAction: chrome.downloads.FilenameConflictAction = 'uniquify'
): Promise<{ filePath: string; downloadId: number }> {
  const rel = normalizeDownloadRelativePath(filename)
  assertDownloadsApi()
  ensureExtensionDownloadFilenameHook()

  let lastErr: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await downloadViaBlobUrl(blob, rel, conflictAction)
    } catch (e) {
      lastErr = e
      console.warn('[AssetVault] blob download attempt failed', attempt + 1, e)
      if (attempt === 0) {
        await ensureOffscreenDocument().catch(() => null)
      }
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error('无法保存到 AssetVault_Temp 子目录，请重新加载扩展')
}
