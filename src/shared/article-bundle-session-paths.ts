/** Align with Pro `sanitizeStorageFileName` (libraryBundle.ts) for bundle md names. */
const WIN_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

export function sanitizeMarkdownBundleFilename(title: string, maxLength = 120): string {
  let name = title.trim().replace(/^.*[/\\]/, '')
  name = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
  name = name.replace(/[.\s]+$/g, '')
  if (!name) name = 'Untitled'

  const dot = name.lastIndexOf('.')
  let stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  stem = stem.trim() || 'Untitled'
  if (WIN_RESERVED.test(stem)) stem = `_${stem}`

  const base = `${stem}${ext || ''}`
  const withMd = base.toLowerCase().endsWith('.md') ? base : `${base}.md`
  if (withMd.length <= maxLength) return withMd
  const keepExt = '.md'
  const stemMax = Math.max(1, maxLength - keepExt.length)
  return `${withMd.slice(0, stemMax).trim() || 'Untitled'}${keepExt}`
}

/** Chrome downloads relative path under the system Downloads folder. */
export function articleBundleDownloadRelative(sessionId: string, relativePath: string): string {
  const rel = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  return `AssetVault_Temp/article/${sessionId}/${rel}`
}

export function isFilePathUnderTempDir(filePath: string, tempDir: string): boolean {
  const normFile = filePath.replace(/\\/g, '/').toLowerCase()
  const normDir = tempDir.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '')
  return normFile === normDir || normFile.startsWith(`${normDir}/`)
}

export const ARTICLE_BUNDLE_THUMB_RELATIVE = '_thumb.jpg'
