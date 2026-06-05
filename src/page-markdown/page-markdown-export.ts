import {

  beginArticleBundleSession,

  importArticleBundleViaSession,

  type ArticleBundleFile,

} from '../shared/article-bundle-session-import'

import {

  resetArticleBundleSessionSupportCache,

  supportsArticleBundleSessionApi,

} from '../shared/article-bundle-session-api'

import { replaceMediaPaths, type MediaItem } from './extract/media-inventory'

import { sanitizeMarkdownBundleFilename } from '../shared/article-bundle-session-paths'

import { captureVisibleTabThrottled } from '../background/service-worker'

import {

  extractPageMarkdownInTab,

  scrollMainColumnImagesIntoView,

  withTabScrolledToTop,

} from './page-markdown-tab-bridge'

import {

  downloadBundleImage,

  downloadMediaFallback,

  ensureHostPermissionsForMediaUrls,

} from './page-markdown-media-download'



async function notify(tabId: number, text: string) {

  try {

    await chrome.tabs.sendMessage(tabId, { type: 'TOAST', text })

  } catch {

    /* content script may be unavailable */

  }

}



const abortControllers = new Map<number, AbortController>()



export function isPageMarkdownAborted(tabId: number): boolean {

  return abortControllers.get(tabId)?.signal.aborted ?? false

}



export function abortPageMarkdown(tabId: number): void {

  abortControllers.get(tabId)?.abort()

}



export async function orchestratePageMarkdownExport(tabId: number, targetFolderId?: string | null) {

  if (abortControllers.has(tabId)) {

    throw new Error('该标签页已有导出任务在运行')

  }



  const ac = new AbortController()

  abortControllers.set(tabId, ac)



  try {

    resetArticleBundleSessionSupportCache()

    const supported = await supportsArticleBundleSessionApi()

    if (!supported) {

      throw new Error('AssetVault Pro 未提供资料包导出 API，请更新并重启桌面端')

    }



    const tab = await chrome.tabs.get(tabId)



    await notify(tabId, '正在提取网页正文…')

    const extractRes = await extractPageMarkdownInTab(tabId)



    if (ac.signal.aborted) throw new Error('已取消')



    const markdownFilename = sanitizeMarkdownBundleFilename(`${extractRes.title}.md`)



    await notify(tabId, '正在准备资料包…')

    const prestarted = await beginArticleBundleSession({

      pageUrl: extractRes.sourceUrl,

      pageTitle: extractRes.title,

      markdownFilename,

      targetFolderId,

    })



    await scrollMainColumnImagesIntoView(tabId, extractRes.mainColumnSelector)



    await notify(tabId, '正在采集页面顶部预览…')

    const thumbDataUrl = await withTabScrolledToTop(tabId, async () => {

      if (ac.signal.aborted) throw new Error('已取消')

      const dataUrl = await captureVisibleTabThrottled(tab.windowId, {

        format: 'jpeg',

        quality: 88,

      })

      if (!dataUrl.startsWith('data:image/')) {

        throw new Error('页面顶部缩略图采集失败')

      }

      return dataUrl

    })



    if (ac.signal.aborted) throw new Error('已取消')



    const successfulOriginalUrls = new Set<string>()

    const files: ArticleBundleFile[] = []



    files.push({

      relativePath: '_thumb.jpg',

      dataUrl: thumbDataUrl,

    })



    const imageMedia = extractRes.media.filter((m) => m.type === 'image')

    const totalMedia = imageMedia.length

    let downloaded = 0

    let failed = 0

    let proDownloadCaps = { proSourceUrlEnabled: true, proFetchBodyEnabled: true }

    await ensureHostPermissionsForMediaUrls(

      extractRes.sourceUrl,

      imageMedia.map((m) => m.highResUrl),

    )



    if (totalMedia === 0) {

      await notify(tabId, '正文内未识别到可下载图片，将仅保存文字')

    } else {

      await notify(tabId, `正在下载媒体资源 (0/${totalMedia})…`)

    }



    const MAX_CONCURRENT = 3

    const queue = [...imageMedia]



    const workers = Array(MAX_CONCURRENT)

      .fill(0)

      .map(async () => {

        while (queue.length > 0) {

          if (ac.signal.aborted) break

          const m = queue.shift()!

          try {

            if (!m.placeholderRelativePath) continue

            const rel = m.placeholderRelativePath.replace('./', '')

            const { result, caps } = await downloadBundleImage(
              {
                sessionId: prestarted.sessionId,
                relativePath: rel,
                sourceUrl: m.highResUrl,
                referer: extractRes.sourceUrl,
                tabId,
                signal: ac.signal,
              },
              proDownloadCaps,
            )
            proDownloadCaps = caps

            if (result.via === 'blob') {
              files.push({ relativePath: rel, blob: result.blob })
            }



            successfulOriginalUrls.add(m.originalUrl)

          } catch (e) {

            console.warn('Media download failed:', m.highResUrl, e)

            failed++

          } finally {

            downloaded++

            if (downloaded % 3 === 0 || downloaded === totalMedia) {

              notify(tabId, `正在下载媒体资源 (${downloaded}/${totalMedia})…`).catch(() => {})

            }

          }

        }

      })



    await Promise.all(workers)



    for (const m of extractRes.media.filter((m) => m.type === 'video')) {

      if (!m.placeholderRelativePath) continue

      try {

        const blob = await downloadMediaFallback(

          tabId,

          m.highResUrl,

          extractRes.sourceUrl,

          ac.signal,

        )

        files.push({

          relativePath: m.placeholderRelativePath.replace('./', ''),

          blob,

        })

        successfulOriginalUrls.add(m.originalUrl)

      } catch (e) {

        console.warn('Video download failed:', m.highResUrl, e)

        failed++

      }

    }



    if (ac.signal.aborted) throw new Error('已取消')



    const finalMd = replaceMediaPaths(extractRes.markdownDraft, extractRes.media, successfulOriginalUrls)

    if (!finalMd.trim()) {

      throw new Error('正文为空，无法保存 Markdown')

    }



    files.push({

      relativePath: markdownFilename,

      blob: new Blob([finalMd], { type: 'text/markdown;charset=utf-8' }),

    })



    const metaJson = {

      sourceUrl: extractRes.sourceUrl,

      ruleId: extractRes.ruleId,

      exportedAt: new Date().toISOString(),

      failed_assets: extractRes.media

        .filter((m) => !successfulOriginalUrls.has(m.originalUrl))

        .map((m) => m.originalUrl),

    }

    files.push({

      relativePath: 'meta.json',

      blob: new Blob([JSON.stringify(metaJson, null, 2)], { type: 'application/json' }),

    })



    await notify(tabId, '正在导入资料库…')



    const result = await importArticleBundleViaSession({

      pageUrl: extractRes.sourceUrl,

      pageTitle: extractRes.title,

      markdownFilename,

      targetFolderId,

      files,

      prestarted,

      shouldAbort: () => ac.signal.aborted,

    })



    if (result.skipped) {

      await notify(tabId, '导出已取消')

    } else {

      let msg = '网页 Markdown 已保存'

      if (failed > 0) msg += `（${failed} 个媒体失败）`

      if (result.warnings.length > 0) msg += ` · ${result.warnings.join('; ')}`

      await notify(tabId, msg)

    }

  } catch (err) {

    const msg = err instanceof Error ? err.message : String(err)

    if (msg.includes('取消') || msg.includes('aborted')) {

      await notify(tabId, '导出已取消')

    } else {

      console.error('Page Markdown Export failed:', err)

      await notify(tabId, `导出失败: ${msg}`)

    }

  } finally {

    abortControllers.delete(tabId)

  }

}


