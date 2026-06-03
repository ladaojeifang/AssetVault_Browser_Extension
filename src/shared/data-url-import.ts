/**
 * Limits for POST /asset/importFromDataUrl — server rejects oversized JSON bodies.
 * Compare against the full data: URL string length (what JSON.stringify sends).
 */

/** ~768KB data URL string — safe for typical API body limits (~1MB). */
export const DATAURL_MAX_DIRECT_JSON_CHARS = 768 * 1024

export function dataUrlFitsDirectImport(
  dataUrl: string,
  maxJsonChars: number = DATAURL_MAX_DIRECT_JSON_CHARS,
): boolean {
  if (maxJsonChars <= 0) return false
  return dataUrl.length <= maxJsonChars
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return blobToBase64DataUrl(blob)
}

/** Pro articleBundle append only accepts `data:*;base64,...` payloads. */
export async function blobToBase64DataUrl(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  if (buf.byteLength === 0) {
    throw new Error('文件内容为空')
  }
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  const b64 = btoa(binary)
  const mime = (blob.type || 'application/octet-stream').split(';')[0]!.trim() || 'application/octet-stream'
  return `data:${mime};base64,${b64}`
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const m = dataUrl.match(/^data:([^;,]*)(?:;charset=[^;,]*)?;base64,(.+)$/s)
  if (!m) {
    throw new Error('无效的 data URL')
  }
  const mime = m[1] || 'application/octet-stream'
  const b64 = m[2]!.replace(/\s/g, '')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}
export function estimateDataUrlDecodedBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return dataUrl.length
  const b64 = dataUrl.slice(comma + 1)
  return Math.floor((b64.length * 3) / 4)
}

/** Unique temp path so importSource never collides with prior screenshot imports. */
export function uniqueTempDownloadFilename(filename: string, uuid = crypto.randomUUID()): string {
  const base = filename.replace(/^AssetVault_Temp[/\\]/i, '').split(/[/\\]/).pop() ?? filename
  return `AssetVault_Temp/${uuid}-${base}`
}
