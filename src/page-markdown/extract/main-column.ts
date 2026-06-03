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

export function extractMainColumn(
  documentClone: Document,
  customSelector?: string
): MainColumnResult | null {
  // 1. Try custom selector if provided
  if (customSelector) {
    const el = documentClone.querySelector(customSelector)
    if (el && el.textContent) {
      const textLen = el.textContent.trim().length
      if (textLen >= 200) {
        const purified = DOMPurify.sanitize(el.outerHTML, PURIFY_CONFIG) as string
        return {
          contentHtml: purified || '',
          title: documentClone.title || '',
          textContent: el.textContent || '',
          byc: 'selector'
        }
      }
    }
  }

  // 2. Fallback to Readability
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
