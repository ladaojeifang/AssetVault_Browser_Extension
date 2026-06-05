import type { PageMdExtractResponse } from './messages'
import type { AssetVaultPageMarkdownApi } from './page-markdown-injected'

/** Wait for layout/paint after programmatic scroll before captureVisibleTab. */
export const PAGE_MD_THUMB_SCROLL_SETTLE_MS = 420

const DOM_MAIN_COLUMN_SELECTORS = [
  '.entry-content',
  '.post-content',
  '.article-content',
  '#js_content',
  '.rich_media_content',
  'article',
  'main',
]

const MIN_DOM_IMG_W = 80
const MIN_DOM_IMG_H = 80
const MIN_DOM_IMG_AREA = 8_000

type G = typeof globalThis & { __assetVaultPageMarkdown?: AssetVaultPageMarkdownApi }

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function readTabScrollYCss(tabId: number): Promise<number> {
  const xs = await chrome.scripting.executeScript({
    target: { tabId },
    func: () =>
      Math.round(
        window.scrollY ||
          document.documentElement.scrollTop ||
          document.body.scrollTop ||
          0,
      ),
  })
  return Math.round(Number(xs[0]?.result ?? 0))
}

export async function scrollTabToYCss(tabId: number, yCss: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (y: number) => {
      const top = Math.max(0, Math.round(y))
      window.scrollTo({ top, left: 0, behavior: 'instant' })
      document.documentElement.scrollTop = top
      document.body.scrollTop = top
    },
    args: [yCss],
  })
}

/** Scroll to page top, run fn, then restore previous scroll (single viewport, not full-page stitch). */
export async function withTabScrolledToTop<T>(
  tabId: number,
  fn: () => Promise<T>,
): Promise<T> {
  const prevY = await readTabScrollYCss(tabId)
  try {
    if (prevY !== 0) {
      await scrollTabToYCss(tabId, 0)
      await sleep(PAGE_MD_THUMB_SCROLL_SETTLE_MS)
    }
    return await fn()
  } finally {
    if (prevY !== 0) {
      await scrollTabToYCss(tabId, prevY)
    }
  }
}

export async function isPageMarkdownInjected(tabId: number): Promise<boolean> {
  const xs = await chrome.scripting
    .executeScript({
      target: { tabId },
      func: () => !!(globalThis as G).__assetVaultPageMarkdown?.extract,
    })
    .catch(() => null)
  return xs?.[0]?.result === true
}

export async function ensurePageMarkdownInjected(tabId: number): Promise<void> {
  if (await isPageMarkdownInjected(tabId)) return
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['page-markdown-injected.js'],
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`无法注入 Markdown 提取脚本（${msg}）`)
  }
  if (!(await isPageMarkdownInjected(tabId))) {
    throw new Error('Markdown 脚本未加载，请执行 pnpm run build 并在 chrome://extensions 重载扩展')
  }
}

export async function extractPageMarkdownInTab(tabId: number): Promise<PageMdExtractResponse> {
  await ensurePageMarkdownInjected(tabId)

  let xs: chrome.scripting.InjectionResult<unknown>[]
  try {
    xs = await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
        const api = (globalThis as G).__assetVaultPageMarkdown
        if (!api?.extract) throw new Error('Markdown 提取 API 未加载')
        return await api.extract()
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`无法在页面执行 Markdown 提取（${msg}）`)
  }

  const payload = xs[0]?.result as PageMdExtractResponse | undefined
  if (!payload || typeof payload !== 'object' || !('markdownDraft' in payload)) {
    throw new Error('Markdown 提取无结果，请刷新页面后重试')
  }
  return payload
}

export type FetchBlobInTabOptions = {
  referer?: string
  mainColumnSelector?: string
  /** All URL variants for this asset (preview, HD, lazy attrs). */
  matchUrls?: string[]
}

/**
 * Download image bytes in tab context (MAIN world fetch with page Referer).
 * Cross-origin CORS may still block; callers should prefer Pro `sourceUrl` append.
 */
export async function fetchBlobInTab(
  tabId: number,
  url: string,
  options: FetchBlobInTabOptions = {},
): Promise<Blob> {
  const { referer } = options
  let xs: chrome.scripting.InjectionResult<unknown>[]
  try {
    xs = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: async (targetUrl: string, pageReferer: string) => {
        const pageRef = pageReferer || location.href
        const headers: Record<string, string> = {}
        headers.Referer = pageRef
        try {
          headers.Origin = new URL(pageRef).origin
        } catch {
          /* ignore */
        }

        const res = await fetch(targetUrl, {
          credentials: 'include',
          mode: 'cors',
          referrer: pageRef,
          referrerPolicy: 'unsafe-url',
          headers,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        if (blob.size === 0) throw new Error('empty body')
        const ct = res.headers.get('content-type') || ''
        if (ct.includes('text/html') && blob.size < 64 * 1024) {
          throw new Error('response is HTML, not image')
        }
        if (blob.size < 4096) {
          throw new Error(`image too small (${blob.size} bytes)`)
        }
        return await blob.arrayBuffer()
      },
      args: [url, referer ?? ''],
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`页面内下载失败: ${msg}`)
  }

  const buf = xs[0]?.result
  if (!(buf instanceof ArrayBuffer) || buf.byteLength === 0) {
    throw new Error('页面内下载无数据')
  }
  return new Blob([buf])
}

export async function scrollMainColumnImagesIntoView(
  tabId: number,
  mainColumnSelector?: string,
): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (columnSelector: string, selectors: string[]) => {
      const list = [columnSelector, ...selectors].filter((s) => !!s?.trim())
      const seen = new Set<HTMLElement>()
      for (const sel of list) {
        const root = document.querySelector(sel)
        if (!(root instanceof HTMLElement) || seen.has(root)) continue
        seen.add(root)
        for (const img of Array.from(root.querySelectorAll('img'))) {
          if (!(img instanceof HTMLImageElement)) continue
          try {
            img.scrollIntoView({ block: 'center', behavior: 'instant' })
          } catch {
            img.scrollIntoView(false)
          }
        }
      }
    },
    args: [mainColumnSelector ?? '', DOM_MAIN_COLUMN_SELECTORS],
  })
  await sleep(400)
}
