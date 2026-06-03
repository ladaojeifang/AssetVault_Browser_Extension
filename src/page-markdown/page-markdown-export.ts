import {
  importArticleBundleViaSession,
  type ArticleBundleFile
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
  fetchBlobInTab,
  withTabScrolledToTop,
} from './page-markdown-tab-bridge'

async function notify(tabId: number, text: string) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'TOAST', text })
  } catch {
    /* content script may be unavailable */
  }
}

// Keeps track of aborted states
const abortControllers = new Map<number, AbortController>()

export function isPageMarkdownAborted(tabId: number): boolean {
  return abortControllers.get(tabId)?.signal.aborted ?? false
}

export function abortPageMarkdown(tabId: number): void {
  abortControllers.get(tabId)?.abort()
}

async function downloadMedia(tabId: number, url: string, signal: AbortSignal): Promise<Blob> {
  if (signal.aborted) throw new Error('aborted')
  try {
    return await fetchBlobInTab(tabId, url)
  } catch {
    const res = await fetch(url, { signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    if (blob.size === 0) throw new Error('empty body')
    return blob
  }
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

    await notify(tabId, '正在提取网页正文…')
    const extractRes = await extractPageMarkdownInTab(tabId)

    if (ac.signal.aborted) throw new Error('已取消')

    const successfulOriginalUrls = new Set<string>()
    const files: ArticleBundleFile[] = []

    files.push({
      relativePath: '_thumb.jpg',
      dataUrl: thumbDataUrl,
    })

    const totalMedia = extractRes.media.length
    let downloaded = 0
    let failed = 0

    if (totalMedia > 0) {
      await notify(tabId, `正在下载媒体资源 (0/${totalMedia})…`)
    }

    // Process concurrently
    const MAX_CONCURRENT = 3
    const queue = [...extractRes.media]
    
    const workers = Array(MAX_CONCURRENT).fill(0).map(async () => {
      while (queue.length > 0) {
        if (ac.signal.aborted) break
        const m = queue.shift()!
        try {
          // Skip if no placeholder relative path assigned
          if (!m.placeholderRelativePath) continue

          const blob = await downloadMedia(tabId, m.highResUrl, ac.signal)
          files.push({
            relativePath: m.placeholderRelativePath.replace('./', ''),
            blob
          })
          successfulOriginalUrls.add(m.originalUrl)
        } catch (e) {
          console.warn('Media download failed:', m.highResUrl, e)
          failed++
        } finally {
          downloaded++
          if (downloaded % 5 === 0) {
            notify(tabId, `正在下载媒体资源 (${downloaded}/${totalMedia})…`).catch(() => {})
          }
        }
      }
    })

    await Promise.all(workers)

    if (ac.signal.aborted) throw new Error('已取消')

    // Replace paths in markdown
    const finalMd = replaceMediaPaths(extractRes.markdownDraft, extractRes.media, successfulOriginalUrls)
    if (!finalMd.trim()) {
      throw new Error('正文为空，无法保存 Markdown')
    }
    const markdownFilename = sanitizeMarkdownBundleFilename(`${extractRes.title}.md`)

    files.push({
      relativePath: markdownFilename,
      blob: new Blob([finalMd], { type: 'text/markdown;charset=utf-8' }),
    })

    // Optionally add meta.json
    const metaJson = {
      sourceUrl: extractRes.sourceUrl,
      ruleId: extractRes.ruleId,
      exportedAt: new Date().toISOString(),
      failed_assets: extractRes.media.filter(m => !successfulOriginalUrls.has(m.originalUrl)).map(m => m.originalUrl)
    }
    files.push({
      relativePath: 'meta.json',
      blob: new Blob([JSON.stringify(metaJson, null, 2)], { type: 'application/json' })
    })

    await notify(tabId, '正在导入资料库…')

    const result = await importArticleBundleViaSession({
      pageUrl: extractRes.sourceUrl,
      pageTitle: extractRes.title,
      markdownFilename,
      targetFolderId,
      files,
      shouldAbort: () => ac.signal.aborted
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
