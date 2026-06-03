let offscreenReady: Promise<void> | null = null

export type DownloadUrlHandle = {
  url: string
  revoke: () => Promise<void>
}

function offscreenCreateDocumentAvailable(): boolean {
  const api = (chrome as { offscreen?: { createDocument?: unknown } }).offscreen
  return typeof api?.createDocument === 'function'
}

function serviceWorkerCanCreateObjectUrl(): boolean {
  try {
    return typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
  } catch {
    return false
  }
}

/**
 * blob: URL for chrome.downloads (subfolder filename is honored).
 * Does not fall back to data: — that saves as 下载.jpg in the Downloads root on Windows.
 */
export async function createDownloadUrlForBlob(blob: Blob): Promise<DownloadUrlHandle> {
  if (serviceWorkerCanCreateObjectUrl()) {
    try {
      const url = URL.createObjectURL(blob)
      return { url, revoke: async () => URL.revokeObjectURL(url) }
    } catch {
      /* try offscreen */
    }
  }

  if (offscreenCreateDocumentAvailable()) {
    try {
      await ensureOffscreenDocument()
      const resp = await chrome.runtime.sendMessage({
        type: 'OFFSCREEN_BLOB_URL',
        buffer: await blob.arrayBuffer(),
        mime: blob.type || 'application/octet-stream'
      })
      if (resp?.ok && typeof resp.objectUrl === 'string') {
        const objectUrl = resp.objectUrl
        return {
          url: objectUrl,
          revoke: () => revokeBlobObjectUrl(objectUrl)
        }
      }
    } catch (e) {
      console.warn('[AssetVault] offscreen blob URL failed', e)
    }
  }

  throw new Error(
    '无法创建 blob 下载链接。请使用 Chrome 109+、在 manifest 中启用 offscreen 权限，并从 dist/ 重新加载扩展。'
  )
}

export async function ensureOffscreenDocument(): Promise<void> {
  if (!offscreenCreateDocumentAvailable()) {
    throw new Error(
      '离屏文档不可用：请在 manifest 中启用 offscreen 权限并重新加载扩展（Chrome 109+）'
    )
  }
  const offscreenUrl = chrome.runtime.getURL('offscreen.html')
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
    documentUrls: [offscreenUrl]
  })
  if (contexts.length > 0) return

  if (!offscreenReady) {
    offscreenReady = chrome.offscreen
      .createDocument({
        url: 'offscreen.html',
        reasons: ['BLOBS' as chrome.offscreen.Reason],
        justification: 'Blob URLs for full-page screenshot import via downloads API'
      })
      .finally(() => {
        offscreenReady = null
      })
  }
  await offscreenReady
}

/** @deprecated Use createDownloadUrlForBlob or downloadBlobToRelativeFilename */
export async function createBlobObjectUrl(blob: Blob): Promise<string> {
  const h = await createDownloadUrlForBlob(blob)
  return h.url
}

export async function revokeBlobObjectUrl(objectUrl: string): Promise<void> {
  if (!objectUrl.startsWith('blob:')) return
  try {
    await chrome.runtime.sendMessage({ type: 'OFFSCREEN_REVOKE_BLOB_URL', objectUrl })
  } catch {
    /* ignore */
  }
}
