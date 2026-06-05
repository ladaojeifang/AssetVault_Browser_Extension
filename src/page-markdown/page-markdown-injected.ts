/**
 * Page Markdown extract (injected via files: ['page-markdown-injected.js']).
 * Built as IIFE in vite — must not ship as ES module with import in injected bundle.
 */
import { extractMainColumn } from './extract/main-column'
import { scanMainColumnMedia } from './extract/main-column-media'
import { convertHtmlToMarkdown } from './convert/turndown'
import { findMatchingRule } from './rules/engine'
import { classifyPageType } from '../board-saver/board-saver-page-detection'
import { AutoScrollEngine } from '../shared/auto-scroll-engine'
import { normalizeLazyImagesInRoot } from './extract/lazy-image-normalize'
import { waitForMainColumnReady } from './extract/wait-main-column'
import {
  buildWechatFallbackArticleHtml,
  supplementHtmlWithWechatImages,
  wechatArticlePhotos,
} from './extract/wechat-page-data'
import type { PageMdExtractResponse } from './messages'

const MAIN_COLUMN_WAIT_SELECTORS = [
  '#js_content',
  '.entry-content',
  '.post-content',
  'article.post',
  'main article',
]

async function ensureLazyLoadedImages(pageUrl: string): Promise<void> {
  const forceWechat = pageUrl.includes('mp.weixin.qq.com')
  const hasLazyMarkup =
    document.querySelector('img[data-src], img[data-lazy-src], img.lazyload, img.loading') !=
    null
  const type = classifyPageType({
    domChangeCount: 0,
    scrollHeight: document.body.scrollHeight,
    viewportHeight: window.innerHeight,
  })
  if (forceWechat || hasLazyMarkup || type === 'lazy' || type === 'waterfall') {
    const engine = new AutoScrollEngine()
    engine.start()
    await new Promise((r) => setTimeout(r, forceWechat ? 5000 : 3500))
    engine.stop()
  }
}

function resolveLiveMainColumnRoot(customSelector?: string): HTMLElement | null {
  const candidates = [
    customSelector,
    '.entry-content',
    '.post-content',
    'article.post',
    'main article',
  ].filter((s): s is string => !!s)
  for (const sel of candidates) {
    const el = document.querySelector(sel)
    if (el instanceof HTMLElement) return el
  }
  return null
}

export async function runPageMarkdownExtract(): Promise<PageMdExtractResponse> {
  const sourceUrl = location.href
  const exportedAt = new Date().toISOString()
  const isWechat = sourceUrl.includes('mp.weixin.qq.com')

  await ensureLazyLoadedImages(sourceUrl)

  const rule = findMatchingRule(sourceUrl)
  const customSelector = rule?.mainColumnSelector

  await waitForMainColumnReady(MAIN_COLUMN_WAIT_SELECTORS, {
    minImages: isWechat ? 5 : 3,
    maxWaitMs: isWechat ? 12_000 : 8_000,
  })

  const liveMain = resolveLiveMainColumnRoot(customSelector)
  if (liveMain) normalizeLazyImagesInRoot(liveMain)
  if (rule?.postProcessDom && liveMain) {
    rule.postProcessDom(liveMain)
  }

  const docClone = document.cloneNode(true) as Document
  normalizeLazyImagesInRoot(docClone.body)

  let title = docClone.title
  if (rule?.titleSelector) {
    const tEl = docClone.querySelector(rule.titleSelector)
    if (tEl?.textContent) title = tEl.textContent.trim()
  }

  if (rule?.postProcessDom) {
    rule.postProcessDom(docClone.body)
  }

  let extracted = extractMainColumn(docClone, customSelector)
  if (!extracted && isWechat) {
    const fallback = buildWechatFallbackArticleHtml(docClone)
    if (fallback) {
      extracted = {
        contentHtml: fallback.contentHtml,
        title: fallback.title,
        textContent: fallback.title,
        byc: 'wechat-page-data',
      }
      if (!title || title === docClone.title) title = fallback.title
    }
  }
  if (!extracted) {
    throw new Error('MAIN_COLUMN_NOT_FOUND')
  }

  const finalTitle = extracted.byc === 'selector' ? title : extracted.title

  let contentHtml = extracted.contentHtml
  if (isWechat) {
    contentHtml = supplementHtmlWithWechatImages(contentHtml, wechatArticlePhotos())
  }

  const mainColumnRoot = liveMain

  const { mediaList } = await scanMainColumnMedia({
    pageUrl: sourceUrl,
    pageTitle: finalTitle,
    contentHtml,
    mainColumnRoot,
  })

  const markdownDraft = convertHtmlToMarkdown(
    contentHtml,
    {
      title: finalTitle,
      sourceUrl,
      exportedAt,
    },
    rule?.turndownRules,
  )

  return {
    title: finalTitle,
    sourceUrl,
    markdownDraft,
    media: mediaList,
    ruleId: rule?.id || extracted.byc,
    mainColumnSelector: customSelector,
  }
}

export type AssetVaultPageMarkdownApi = {
  extract: () => Promise<PageMdExtractResponse>
}

function installApi(): void {
  const g = globalThis as typeof globalThis & { __assetVaultPageMarkdown?: AssetVaultPageMarkdownApi }
  g.__assetVaultPageMarkdown = {
    extract: runPageMarkdownExtract,
  }
}

installApi()
