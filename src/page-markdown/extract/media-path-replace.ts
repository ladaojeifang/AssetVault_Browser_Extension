/** Minimal fields needed for Markdown path rewrite (kept separate for unit tests). */
export interface MediaPathReplaceItem {
  originalUrl: string
  replaceUrls?: string[]
  placeholderRelativePath?: string
  type: 'image' | 'video'
  extension: string
}

/** Assign `./assets/img-NNN` / `vid-NNN` paths after media list is built. */
export function assignPlaceholderPaths(mediaList: MediaPathReplaceItem[]): void {
  let imgCount = 0
  let vidCount = 0
  mediaList.forEach((m) => {
    if (m.type === 'image') {
      imgCount++
      m.placeholderRelativePath = `./assets/img-${String(imgCount).padStart(3, '0')}.${m.extension}`
    } else {
      vidCount++
      m.placeholderRelativePath = `./assets/vid-${String(vidCount).padStart(3, '0')}.${m.extension}`
    }
  })
}

function urlReplaceVariants(url: string): string[] {
  const out = new Set<string>()
  if (!url?.trim()) return []
  out.add(url)
  try {
    const u = new URL(url)
    if (u.protocol === 'https:') out.add(url.replace(/^https:/i, 'http:'))
    if (u.protocol === 'http:') out.add(url.replace(/^http:/i, 'https:'))
    out.add(`//${u.host}${u.pathname}${u.search}`)
  } catch {
    /* ignore */
  }
  if (url.includes('&')) out.add(url.replace(/&/g, '&amp;'))
  return [...out]
}

/** Map each remote URL to at most one local path (first media row in list order wins). */
export function replaceMediaPaths(
  markdown: string,
  mediaList: MediaPathReplaceItem[],
  successfulOriginalUrls: Set<string>,
): string {
  const urlToPath = new Map<string, string>()

  for (const m of mediaList) {
    if (!successfulOriginalUrls.has(m.originalUrl) || !m.placeholderRelativePath) continue
    const urls = m.replaceUrls?.length ? m.replaceUrls : [m.originalUrl]
    for (const url of urls) {
      for (const variant of urlReplaceVariants(url)) {
        if (!urlToPath.has(variant)) urlToPath.set(variant, m.placeholderRelativePath)
      }
    }
  }

  let finalMd = markdown
  const sortedUrls = [...urlToPath.keys()].sort((a, b) => b.length - a.length)
  for (const url of sortedUrls) {
    const path = urlToPath.get(url)!
    const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    finalMd = finalMd.replace(new RegExp(escapedUrl, 'g'), path)
  }

  return finalMd
}
