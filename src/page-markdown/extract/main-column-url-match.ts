/** URL matching for main-column media filter (no DOM/collect-meta imports — testable in Node). */

export function canonicalImagePath(url: string): string {
  try {
    const u = new URL(url)
    return `${u.hostname}${u.pathname}`
  } catch {
    return url
  }
}

export function collectContentHtmlImagePaths(contentHtml: string): Set<string> {
  const paths = new Set<string>()
  const re = /(?:mmbiz\.qpic\.cn|qpic\.cn|wx\.qlogo\.cn)[^\s"'<>]*/gi
  for (const hit of contentHtml.match(re) || []) {
    const cleaned = hit.replace(/&amp;/g, '&').split(/[?#]/)[0] || ''
    if (cleaned.length > 12) paths.add(cleaned)
  }
  try {
    const doc = new DOMParser().parseFromString(contentHtml, 'text/html')
    doc.querySelectorAll('img').forEach((img) => {
      for (const attr of ['src', 'data-src', 'data-originalsrc', 'data-mmsrc']) {
        const raw = img.getAttribute(attr)
        if (!raw || /^data:/i.test(raw)) continue
        try {
          paths.add(canonicalImagePath(new URL(raw, 'https://example.com/').href))
        } catch {
          /* ignore */
        }
      }
    })
  } catch {
    /* ignore */
  }
  return paths
}

export function isUrlInMainColumn(
  url: string,
  contentHtml: string,
  mainColumnUrls: Set<string>,
  contentPaths?: Set<string>,
): boolean {
  if (mainColumnUrls.has(url)) return true

  const decodedHtml = contentHtml.replace(/&amp;/g, '&')
  if (decodedHtml.includes(url)) return true

  const path = canonicalImagePath(url)
  for (const m of mainColumnUrls) {
    if (canonicalImagePath(m) === path) return true
  }

  const paths = contentPaths ?? collectContentHtmlImagePaths(contentHtml)
  for (const p of paths) {
    if (path.includes(p) || p.includes(path) || url.includes(p)) return true
  }

  try {
    const pathname = new URL(url).pathname
    if (pathname.length > 8 && decodedHtml.includes(pathname)) return true
  } catch {
    /* ignore */
  }

  return false
}
