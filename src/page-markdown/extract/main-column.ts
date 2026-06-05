import { Readability } from '@mozilla/readability'
import DOMPurify from 'dompurify'

export interface MainColumnResult {
  contentHtml: string // The purified HTML of the main column
  title: string
  textContent: string // Raw text for checking length/quality
  byc: string // 'selector' or 'readability'
}

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr', 'a', 'b', 'strong', 'i', 'em', 'u', 'em', 'strike', 's', 'del',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'blockquote', 'pre', 'code', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'img', 'video', 'source', 'figure', 'figcaption',
    'div', 'span', 'article', 'section', 'main' // containers to keep structure
  ],
  ALLOWED_ATTR: [
    'href', 'src', 'alt', 'title', 'class', 'id', 'data-src', 'width', 'height',
    'controls', 'poster'
  ],
  FORBID_TAGS: ['script', 'style', 'noscript', 'iframe', 'object', 'embed', 'form'],
  KEEP_CONTENT: true // For forbidden tags like form, we might drop the content, but let's be safe. Usually DOMPurify drops script/style content by default.
}

/** Common CMS / blog main-column selectors (before Readability). */
const GENERIC_MAIN_COLUMN_SELECTORS = [
  '.entry-content',
  '.post-content',
  '.article-content',
  '.single-content',
  '#content_views',
  'article.post',
  'article .content',
  'main article',
]

function extractFromSelectorRoot(
  documentClone: Document,
  el: Element,
  byc: string,
): MainColumnResult | null {
  if (!(el instanceof HTMLElement) || !el.textContent) return null
  const textLen = el.textContent.trim().length
  if (textLen < 200) return null
  const purified = DOMPurify.sanitize(el.outerHTML, PURIFY_CONFIG) as string
  return {
    contentHtml: purified || '',
    title: documentClone.title || '',
    textContent: el.textContent || '',
    byc,
  }
}

export function extractMainColumn(
  documentClone: Document,
  customSelector?: string
): MainColumnResult | null {
  // 1. Site rule selector
  if (customSelector) {
    const el = documentClone.querySelector(customSelector)
    if (el) {
      const hit = extractFromSelectorRoot(documentClone, el, 'selector')
      if (hit) return hit
    }
  }

  // 2. Generic blog/CMS selectors (WordPress themes, etc.)
  for (const sel of GENERIC_MAIN_COLUMN_SELECTORS) {
    const el = documentClone.querySelector(sel)
    if (!el) continue
    const hit = extractFromSelectorRoot(documentClone, el, `generic:${sel}`)
    if (hit) return hit
  }

  // 3. Fallback to Readability
  // Note: Readability modifies the DOM it is given, so we use a clone (or assume caller passed a clone)
  const reader = new Readability(documentClone)
  const article = reader.parse()

  if (article && article.content) {
    const purified = DOMPurify.sanitize(article.content, PURIFY_CONFIG) as string
    return {
      contentHtml: purified || '',
      title: article.title || documentClone.title || '',
      textContent: article.textContent || '',
      byc: 'readability'
    }
  }

  return null
}
