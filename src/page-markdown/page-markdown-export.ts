import {
  importArticleBundleViaSession,
  type ArticleBundleFile
} from '../shared/article-bundle-session-import'
import { supportsArticleBundleSessionApi } from '../shared/article-bundle-session-api'
import { replaceMediaPaths, type MediaItem } from './extract/media-inventory'
import { sanitizeFilename } from './convert/sanitize-filename'
import { captureVisibleTabThrottled } from '../background/service-worker'
import type { PageMdExtractResponse } from './messages'

async function notify(tabId: number, text: string) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'SHOW_TOAST', text })
  } catch (e) {
    // maybe no content script
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

async function injectAndExtract(tabId: number): Promise<PageMdExtractResponse> {
  // Inject the IIFE content script
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['page-markdown-injected.js']
  })

  // Send the message to extract
  const response = await chrome.tabs.sendMessage(tabId, { type: 'PAGE_MD_EXTRACT' })
  if (response.error) {
    throw new Error(response.error)
  }
  return response as PageMdExtractResponse
}

async function downloadMedia(
  url: string,
  signal: AbortSignal
): Promise<Blob> {
  // Try fetching directly from SW. 
  // In a robust implementation, we might delegate back to content script to fetch with correct referer.
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.blob()
}

export async function orchestratePageMarkdownExport(tabId: number, targetFolderId?: string | null) {
  if (abortControllers.has(tabId)) {
    throw new Error('该标签页已有导出任务在运行')
  }

  const ac = new AbortController()
  abortControllers.set(tabId, ac)

  try {
    const supported = await supportsArticleBundleSessionApi()
    if (!supported) {
      throw new Error('AssetVault Pro 未提供资料包导出 API，请更新并重启桌面端')
    }

    await notify(tabId, '正在提取网页正文…')
    const extractRes = await injectAndExtract(tabId)

    if (ac.signal.aborted) throw new Error('已取消')

    // Take viewport thumbnail
    const thumbDataUrl = await captureVisibleTabThrottled(chrome.windows.WINDOW_ID_CURRENT)
    const thumbRes = await fetch(thumbDataUrl)
    const thumbBlob = await thumbRes.blob()

    if (ac.signal.aborted) throw new Error('已取消')

    // Download Media
    const successfulOriginalUrls = new Set<string>()
    const files: ArticleBundleFile[] = []

    files.push({
      relativePath: '_thumb.jpg',
      blob: thumbBlob
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

          const blob = await downloadMedia(m.highResUrl, ac.signal)
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
    const safeTitle = sanitizeFilename(extractRes.title)

    files.push({
      relativePath: `${safeTitle}.md`,
      blob: new Blob([finalMd], { type: 'text/markdown' })
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
      markdownFilename: `${safeTitle}.md`,
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
