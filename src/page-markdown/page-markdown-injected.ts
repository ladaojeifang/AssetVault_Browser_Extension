/**
 * Page Markdown extract (injected via files: ['page-markdown-injected.js']).
 * Built as IIFE in vite — must not ship as ES module with import in injected bundle.
 */
import { extractMainColumn } from './extract/main-column'
import { scanMedia } from './extract/media-inventory'
import { convertHtmlToMarkdown } from './convert/turndown'
import { findMatchingRule } from './rules/engine'
import { classifyPageType } from '../board-saver/board-saver-page-detection'
import { AutoScrollEngine } from '../shared/auto-scroll-engine'
import type { PageMdExtractResponse } from './messages'

async function ensureLazyLoadedImages(): Promise<void> {
  const type = classifyPageType({
    domChangeCount: 0,
    scrollHeight: document.body.scrollHeight,
    viewportHeight: window.innerHeight,
  })
  if (type === 'lazy' || type === 'waterfall') {
    const engine = new AutoScrollEngine()
    engine.start()
    await new Promise((r) => setTimeout(r, 3000))
    engine.stop()
  }
}

export async function runPageMarkdownExtract(): Promise<PageMdExtractResponse> {
  const sourceUrl = location.href
  const exportedAt = new Date().toISOString()

  await ensureLazyLoadedImages()

  const rule = findMatchingRule(sourceUrl)
  const customSelector = rule?.mainColumnSelector

  const docClone = document.cloneNode(true) as Document

  let title = docClone.title
  if (rule?.titleSelector) {
    const tEl = docClone.querySelector(rule.titleSelector)
    if (tEl?.textContent) title = tEl.textContent.trim()
  }

  if (rule?.postProcessDom) {
    rule.postProcessDom(docClone.body)
  }

  const extracted = extractMainColumn(docClone, customSelector)
  if (!extracted) {
    throw new Error('MAIN_COLUMN_NOT_FOUND')
  }

  const finalTitle = extracted.byc === 'selector' ? title : extracted.title

  const { mediaList } = await scanMedia(extracted.contentHtml, sourceUrl)

  const markdownDraft = convertHtmlToMarkdown(
    extracted.contentHtml,
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
