import { absoluteUrl } from '../../shared/collect-meta-core'
import { collectImageUrlsFromImg } from '../../shared/image-url-resolve'
import type { CollectMeta } from '../../shared/types'
import {
  canonicalImagePath,
  collectContentHtmlImagePaths,
  isUrlInMainColumn,
} from './main-column-url-match'

export { canonicalImagePath, isUrlInMainColumn } from './main-column-url-match'

/** Collect absolute image/video URLs referenced inside a DOM subtree (live page). */
export function collectUrlsFromElement(root: HTMLElement, pageUrl: string): Set<string> {
  const out = new Set<string>()

  const add = (raw: string | null | undefined) => {
    if (!raw?.trim()) return
    const abs = absoluteUrl(raw.trim(), pageUrl)
    if (!abs || abs.startsWith('data:') || abs.startsWith('blob:')) return
    out.add(abs)
  }

  root.querySelectorAll('img').forEach((img) => {
    for (const u of collectImageUrlsFromImg(img, pageUrl)) out.add(u)
  })

  root.querySelectorAll('video, source').forEach((el) => {
    add(el.getAttribute('src'))
  })

  root.querySelectorAll('[style*="background"]').forEach((el) => {
    if (!(el instanceof HTMLElement)) return
    try {
      const bg = getComputedStyle(el).backgroundImage
      const m = bg?.match(/url\(["']?([^"')]+)["']?\)/)
      if (m?.[1]) add(m[1])
    } catch {
      /* ignore */
    }
  })

  return out
}

export function filterCollectMetaToMainColumn(
  items: CollectMeta[],
  contentHtml: string,
  mainColumnUrls: Set<string>,
): CollectMeta[] {
  const contentPaths = collectContentHtmlImagePaths(contentHtml)
  return items.filter((m) =>
    isUrlInMainColumn(m.url, contentHtml, mainColumnUrls, contentPaths),
  )
}
