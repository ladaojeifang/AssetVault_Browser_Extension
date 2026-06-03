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
    viewportHeight: window.innerHeight
  })
  if (type === 'lazy' || type === 'waterfall') {
    // Basic fast scroll to trigger loading before DOM parsing
    const engine = new AutoScrollEngine()
    engine.start()
    // Give it 3 seconds max to roll down a bit
    await new Promise(r => setTimeout(r, 3000))
    engine.stop()
  }
}

// Entry point for injected script
export async function runPageMarkdownExtract(): Promise<PageMdExtractResponse> {
  const sourceUrl = location.href
  const exportedAt = new Date().toISOString()
  
  await ensureLazyLoadedImages()
  
  const rule = findMatchingRule(sourceUrl)
  const customSelector = rule?.mainColumnSelector
  
  // Clone doc to not ruin the active reading session
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

  // Use override title if found
  const finalTitle = extracted.byc === 'selector' ? title : extracted.title

  const { mediaList } = await scanMedia(extracted.contentHtml, sourceUrl)

  const markdownDraft = convertHtmlToMarkdown(
    extracted.contentHtml,
    {
      title: finalTitle,
      sourceUrl,
      exportedAt
    },
    rule?.turndownRules
  )

  return {
    title: finalTitle,
    sourceUrl,
    markdownDraft,
    media: mediaList,
    ruleId: rule?.id || extracted.byc
  }
}

// Automatically bind to messages if injected
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'PAGE_MD_EXTRACT') {
      runPageMarkdownExtract().then(sendResponse).catch(err => {
        sendResponse({ error: err.message || String(err) })
      })
      return true
    }
  })
}
