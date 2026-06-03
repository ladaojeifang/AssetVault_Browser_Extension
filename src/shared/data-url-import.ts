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
