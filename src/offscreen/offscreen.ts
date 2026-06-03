/** Offscreen document — blob: URLs only (chrome.downloads runs in the service worker). */

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object' || !('type' in message)) return

  if (message.type === 'OFFSCREEN_PING') {
    sendResponse({ ok: true })
    return
  }

  if (message.type === 'OFFSCREEN_BLOB_URL') {
    try {
      const msg = message as { blob?: Blob; buffer?: ArrayBuffer; mime?: string }
      const blob =
        msg.blob ??
        new Blob([msg.buffer!], { type: msg.mime || 'application/octet-stream' })
      const objectUrl = URL.createObjectURL(blob)
      sendResponse({ ok: true, objectUrl })
    } catch (e) {
      sendResponse({
        ok: false,
        error: e instanceof Error ? e.message : String(e)
      })
    }
    return true
  }

  if (message.type === 'OFFSCREEN_REVOKE_BLOB_URL') {
    try {
      URL.revokeObjectURL((message as { objectUrl: string }).objectUrl)
      sendResponse({ ok: true })
    } catch (e) {
      sendResponse({
        ok: false,
        error: e instanceof Error ? e.message : String(e)
      })
    }
    return true
  }

  return undefined
})
