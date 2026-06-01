import type { CollectMeta } from './types'
import { enlargeImageUrl, isLowResTwitterMediaUrl } from './url-enlarger'
import {
  toTwitterOrigUrl,
  toTwitterPreviewUrl,
  twitterMediaKeyFromUrl,
  type XStatusPhoto
} from './x-syndication'

export type BatchImageVariant = 'preview' | 'hd'

export type CollectMetaWithVariant = CollectMeta & {
  variant: BatchImageVariant
  variantLabel: string
  mediaKey?: string
}

function formatResolution(width?: number, height?: number): string {
  if (width && height && width > 0 && height > 0) return `${width}×${height}`
  return ''
}

function metaItem(args: {
  url: string
  filename: string
  pageUrl: string
  pageTitle: string
  variant: BatchImageVariant
  variantLabel: string
  mediaKey?: string
  width?: number
  height?: number
}): CollectMetaWithVariant {
  const res = formatResolution(args.width, args.height)
  return {
    url: args.url,
    filename: args.filename,
    pageUrl: args.pageUrl,
    pageTitle: args.pageTitle,
    width: args.width,
    height: args.height,
    variant: args.variant,
    variantLabel: res ? `${args.variantLabel} · ${res}` : args.variantLabel,
    mediaKey: args.mediaKey
  }
}

/** Build preview + HD rows for one X media id. */
export function buildXBatchCollectMeta(args: {
  mediaKeys: Iterable<string>
  rawUrls: string[]
  apiPhotos: XStatusPhoto[]
  pageUrl: string
  pageTitle: string
}): CollectMetaWithVariant[] {
  const { mediaKeys, rawUrls, apiPhotos, pageUrl, pageTitle } = args
  const byKey = new Map<
    string,
    { previewUrl: string; hdUrl: string; width?: number; height?: number }
  >()

  const ensure = (key: string) => {
    let row = byKey.get(key)
    if (!row) {
      row = {
        previewUrl: toTwitterPreviewUrl(key),
        hdUrl: toTwitterOrigUrl(key)
      }
      byKey.set(key, row)
    }
    return row
  }

  for (const key of mediaKeys) ensure(key)

  for (const photo of apiPhotos) {
    const row = ensure(photo.mediaKey)
    row.hdUrl = photo.hdUrl
    if (photo.previewUrl) row.previewUrl = photo.previewUrl
    if (photo.width) row.width = photo.width
    if (photo.height) row.height = photo.height
  }

  for (const raw of rawUrls) {
    const key = twitterMediaKeyFromUrl(raw)
    if (!key) continue
    const row = ensure(key)
    if (isLowResTwitterMediaUrl(raw) || /[?&]name=(?:small|medium|thumb|mini|360x360)\b/i.test(raw)) {
      row.previewUrl = raw
    } else if (/[?&]name=orig\b/i.test(raw) || /name=4096x4096|name=large\b/i.test(raw)) {
      row.hdUrl = raw
    }
  }

  const out: CollectMetaWithVariant[] = []
  for (const [mediaKey, row] of byKey) {
    const base = mediaKey.slice(0, 24)
    out.push(
      metaItem({
        url: row.previewUrl,
        filename: `${base}-preview.jpg`,
        pageUrl,
        pageTitle,
        variant: 'preview',
        variantLabel: '预览图',
        mediaKey,
        width: row.width,
        height: row.height
      })
    )
    out.push(
      metaItem({
        url: row.hdUrl,
        filename: `${base}-orig.jpg`,
        pageUrl,
        pageTitle,
        variant: 'hd',
        variantLabel: '高清原图',
        mediaKey,
        width: row.width,
        height: row.height
      })
    )
  }

  return out
}

/** Non-X: page URL as preview; enlarged URL as HD when different. */
export async function expandGenericBatchVariants(
  items: CollectMeta[],
  _pageUrl: string
): Promise<CollectMetaWithVariant[]> {
  const out: CollectMetaWithVariant[] = []
  const seenHd = new Set<string>()

  for (const m of items) {
    const res = formatResolution(m.width, m.height)
    out.push({
      ...m,
      variant: 'preview',
      variantLabel: res ? `页面图 · ${res}` : '页面图'
    })

    try {
      const big = await enlargeImageUrl(m.url)
      if (big && big !== m.url && !seenHd.has(big)) {
        seenHd.add(big)
        out.push({
          ...m,
          url: big,
          filename: m.filename ? m.filename.replace(/(\.[^.]+)?$/, '-hd$1') : 'image-hd.jpg',
          variant: 'hd',
          variantLabel: '高清'
        })
      }
    } catch {
      /* ignore */
    }
  }

  return out
}
