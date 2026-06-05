/**

 * Markdown export media: batch collect discovery + main-column HTML (Turndown-aligned).

 */



import { scanPageMedia } from '../../shared/element-meta'

import { isArticleImageUrl, pickBestImageUrl } from '../../shared/image-url-resolve'

import { enlargeImageUrl } from '../../shared/url-enlarger'

import type { CollectMeta } from '../../shared/types'

import { collectImageMediaFromContentHtml } from './content-html-images'

import {

  assignPlaceholderPaths,

  getExtensionFromUrl,

  type MediaItem,

  type MediaInventoryResult,

} from './media-inventory'

import { canonicalImagePath } from './main-column-url-match'

import {

  collectUrlsFromElement,

  filterCollectMetaToMainColumn,

} from './main-column-url-filter'

import {

  wechatArticlePhotos,

  type WechatPictureEntry,

} from './wechat-page-data'



export { isUrlInMainColumn } from './main-column-url-match'

export {

  collectUrlsFromElement,

  filterCollectMetaToMainColumn,

} from './main-column-url-filter'



type ImageGroup = { previewUrl?: string; hdUrl?: string; urls: Set<string> }



function groupImageCollectMeta(filtered: CollectMeta[]): ImageGroup[] {

  const byKey = new Map<string, ImageGroup>()



  for (const m of filtered) {

    const key = m.mediaKey ?? canonicalImagePath(m.url)

    let g = byKey.get(key)

    if (!g) {

      g = { urls: new Set() }

      byKey.set(key, g)

    }

    g.urls.add(m.url)

    if (m.variant === 'hd') g.hdUrl = m.url

    else g.previewUrl = m.url

  }



  return [...byKey.values()]

}



function pathsForItem(m: MediaItem): Set<string> {

  const paths = new Set<string>()

  for (const u of [m.originalUrl, m.highResUrl, ...m.replaceUrls]) {

    paths.add(canonicalImagePath(u))

  }

  return paths

}



function itemMatchesBatchKey(item: MediaItem, batch: MediaItem): boolean {

  const a = pathsForItem(item)

  const b = pathsForItem(batch)

  for (const p of b) {

    if (a.has(p)) return true

  }

  return false

}



function mergeInto(target: MediaItem, incoming: MediaItem, pageUrl: string): void {
  for (const u of incoming.replaceUrls) target.replaceUrls.push(u)
  target.replaceUrls = [...new Set(target.replaceUrls)]
  const best = pickBestImageUrl(
    [
      target.highResUrl,
      incoming.highResUrl,
      target.originalUrl,
      incoming.originalUrl,
      ...target.replaceUrls,
      ...incoming.replaceUrls,
    ],
    pageUrl,
  )
  if (best) target.highResUrl = best
}



function mergeImageMediaItems(
  primary: MediaItem[],
  extra: MediaItem[],
  pageUrl: string,
): MediaItem[] {

  const byPath = new Map<string, MediaItem>()



  for (const m of primary) {

    const key = canonicalImagePath(m.originalUrl)

    byPath.set(key, {

      ...m,

      replaceUrls: [...new Set(m.replaceUrls)],

    })

  }



  for (const m of extra) {

    const key = canonicalImagePath(m.originalUrl)

    const prev = byPath.get(key)

    if (prev) {

      mergeInto(prev, m, pageUrl)

      continue

    }

    let matched: MediaItem | undefined

    for (const item of byPath.values()) {

      if (itemMatchesBatchKey(item, m)) {

        matched = item

        break

      }

    }

    if (matched) mergeInto(matched, m, pageUrl)

    else {

      byPath.set(key, { ...m, replaceUrls: [...new Set(m.replaceUrls)] })

    }

  }



  return [...byPath.values()]

}



/** Batch scan only upgrades URLs for images already in purified HTML (no extra sidebar rows). */

function enrichFromBatchScan(
  contentImages: MediaItem[],
  batch: MediaItem[],
  pageUrl: string,
): MediaItem[] {

  if (batch.length === 0) return contentImages

  const out = contentImages.map((m) => ({

    ...m,

    replaceUrls: [...new Set(m.replaceUrls)],

  }))

  for (const b of batch) {

    const target = out.find((item) => itemMatchesBatchKey(item, b))

    if (target) mergeInto(target, b, pageUrl)

  }

  return out

}



async function buildImageMediaItemsFromBatch(

  groups: ImageGroup[],

  mainColumnUrls: Set<string>,

  contentHtml: string,

  pageUrl: string,

): Promise<MediaItem[]> {

  const out: MediaItem[] = []



  for (const g of groups) {

    const preview = g.previewUrl ?? g.hdUrl

    if (!preview || !isArticleImageUrl(preview, pageUrl)) continue



    let highRes = g.hdUrl ?? preview

    if (!g.hdUrl) {

      try {

        const enlarged = await enlargeImageUrl(preview)

        if (enlarged && isArticleImageUrl(enlarged, pageUrl)) highRes = enlarged

      } catch {

        highRes = preview

      }

    }



    const replaceUrls = new Set<string>(g.urls)

    replaceUrls.add(preview)

    replaceUrls.add(highRes)

    const best = pickBestImageUrl(replaceUrls, pageUrl) ?? highRes

    out.push({

      originalUrl: preview,

      replaceUrls: [...replaceUrls],

      highResUrl: best,

      tagName: 'IMG',

      type: 'image',

      extension: getExtensionFromUrl(best, 'jpg'),

    })

  }



  return out

}



async function buildImageMediaItemsFromWechatPhotos(

  photos: WechatPictureEntry[],

): Promise<MediaItem[]> {

  const out: MediaItem[] = []

  for (const p of photos) {

    let highRes = p.url

    try {

      const enlarged = await enlargeImageUrl(p.url)

      if (enlarged && isArticleImageUrl(enlarged, '')) highRes = enlarged

    } catch {

      /* use page cdn_url */

    }

    out.push({

      originalUrl: p.url,

      replaceUrls: [p.url, highRes],

      highResUrl: pickBestImageUrl([p.url, highRes], '') ?? highRes,

      tagName: 'IMG',

      type: 'image',

      extension: getExtensionFromUrl(highRes, 'jpg'),

    })

  }

  return out

}



function scanVideosFromMainColumnHtml(htmlString: string, baseUrl: string): MediaItem[] {

  const parser = new DOMParser()

  const doc = parser.parseFromString(htmlString, 'text/html')

  const mediaList: MediaItem[] = []

  const urlSet = new Set<string>()



  doc.querySelectorAll('video, source').forEach((vid) => {

    let src = vid.getAttribute('src') || ''

    if (!src) return

    try {

      src = new URL(src, baseUrl).href

    } catch {

      return

    }

    if (urlSet.has(src)) return

    urlSet.add(src)

    mediaList.push({

      originalUrl: src,

      replaceUrls: [src],

      highResUrl: src,

      tagName: vid.tagName,

      type: 'video',

      extension: getExtensionFromUrl(src, 'mp4'),

    })

  })



  return mediaList

}



export async function scanMainColumnMedia(args: {

  pageUrl: string

  pageTitle: string

  contentHtml: string

  mainColumnRoot: HTMLElement | null

}): Promise<MediaInventoryResult> {

  const mainColumnUrls = args.mainColumnRoot

    ? collectUrlsFromElement(args.mainColumnRoot, args.pageUrl)

    : new Set<string>()



  const wechatPhotos =

    args.pageUrl.includes('mp.weixin.qq.com') ? wechatArticlePhotos() : []

  for (const p of wechatPhotos) mainColumnUrls.add(p.url)



  const fromHtml = await collectImageMediaFromContentHtml(args.contentHtml, args.pageUrl)



  const scanned = await scanPageMedia(args.pageUrl, args.pageTitle)

  const filtered = filterCollectMetaToMainColumn(

    scanned.filter(

      (m) =>

        isArticleImageUrl(m.url, args.pageUrl) &&

        (!m.variant || m.variant === 'preview' || m.variant === 'hd'),

    ),

    args.contentHtml,

    mainColumnUrls,

  )



  const fromBatch = await buildImageMediaItemsFromBatch(

    groupImageCollectMeta(filtered),

    mainColumnUrls,

    args.contentHtml,

    args.pageUrl,

  )



  const fromWechat = await buildImageMediaItemsFromWechatPhotos(wechatPhotos)

  const withWechat =

    args.pageUrl.includes('mp.weixin.qq.com') && fromWechat.length > 0

      ? mergeImageMediaItems(fromHtml, fromWechat, args.pageUrl)

      : fromHtml

  const images = enrichFromBatchScan(withWechat, fromBatch, args.pageUrl).filter((m) =>
    isArticleImageUrl(m.highResUrl, args.pageUrl),
  )

  const videos = scanVideosFromMainColumnHtml(args.contentHtml, args.pageUrl)



  const mediaList = [...images, ...videos]

  assignPlaceholderPaths(mediaList)

  return { mediaList }

}


