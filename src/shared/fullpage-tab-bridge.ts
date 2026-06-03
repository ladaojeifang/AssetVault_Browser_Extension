import { isFullpageScrollAtTarget } from './fullpage-page-helpers'
import type { AssetVaultFullpageApi, FullpageSetupResult } from './fullpage-injected'

export const FULLPAGE_AFTER_SCROLL_MS = 520
export const FULLPAGE_SCROLL_RETRY_WAIT_MS = 1000

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

type G = typeof globalThis & { __assetVaultFullpage?: AssetVaultFullpageApi }

export async function isFullpageInjected(tabId: number): Promise<boolean> {
  const xs = await chrome.scripting
    .executeScript({
      target: { tabId },
      func: () => !!(globalThis as G).__assetVaultFullpage?.setup,
    })
    .catch(() => null)
  return xs?.[0]?.result === true
}

export async function ensureFullpageInjected(tabId: number): Promise<void> {
  if (await isFullpageInjected(tabId)) return
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['fullpage-injected.js'],
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`无法注入整页脚本（${msg}）`)
  }
  if (!(await isFullpageInjected(tabId))) {
    throw new Error('整页脚本未加载，请执行 pnpm run build 并在 chrome://extensions 重载扩展')
  }
}

export async function setupFullpageInTab(tabId: number): Promise<FullpageSetupResult> {
  await ensureFullpageInjected(tabId)
  let xs: chrome.scripting.InjectionResult<unknown>[]
  try {
    xs = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const api = (globalThis as G).__assetVaultFullpage
        if (!api?.setup) return { error: 'API_MISSING' as const }
        try {
          return { ok: api.setup() as FullpageSetupResult }
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) }
        }
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`无法在页面执行整页初始化（${msg}）`)
  }

  const raw = xs[0]?.result as
    | { ok: FullpageSetupResult }
    | { error: string }
    | FullpageSetupResult
    | undefined

  if (raw && typeof raw === 'object' && 'ok' in raw && raw.ok && 'scrollHeightCss' in raw.ok) {
    return raw.ok
  }
  if (raw && typeof raw === 'object' && 'scrollHeightCss' in raw && !('error' in raw)) {
    return raw as FullpageSetupResult
  }
  const detail =
    raw && typeof raw === 'object' && 'error' in raw
      ? String(raw.error)
      : '整页脚本未加载，请执行 pnpm run build 并在 chrome://extensions 重载扩展'
  throw new Error(detail)
}

export async function readFullpageScrollMetricsInTab(
  tabId: number,
): Promise<{ scrollHeightCss: number; viewportHeightCss: number } | null> {
  const xs = await chrome.scripting
    .executeScript({
      target: { tabId },
      func: () => {
        const api = (globalThis as G).__assetVaultFullpage
        return api?.readMetrics?.() ?? null
      },
    })
    .catch(() => null)
  const r = xs?.[0]?.result
  if (!r || typeof r !== 'object' || !('scrollHeightCss' in r)) return null
  return r as { scrollHeightCss: number; viewportHeightCss: number }
}

async function readScrollYCssInTab(tabId: number): Promise<number> {
  const xs = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => (globalThis as G).__assetVaultFullpage?.readScrollYCss() ?? -1,
  })
  return Math.round(Number(xs[0]?.result ?? -1))
}

async function scrollToYCssInTab(tabId: number, yCss: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (y: number) => {
      ;(globalThis as G).__assetVaultFullpage?.scrollTo(y)
    },
    args: [yCss],
  })
}

/** Scroll to yCss, verify position (with retry), then wait for lazy layout. */
export async function scrollFullpageToCss(tabId: number, yCss: number): Promise<void> {
  await scrollToYCssInTab(tabId, yCss)
  await sleep(FULLPAGE_AFTER_SCROLL_MS)
  let actual = await readScrollYCssInTab(tabId)

  if (!isFullpageScrollAtTarget(yCss, actual)) {
    await sleep(FULLPAGE_SCROLL_RETRY_WAIT_MS)
    actual = await readScrollYCssInTab(tabId)
    if (!isFullpageScrollAtTarget(yCss, actual)) {
      await scrollToYCssInTab(tabId, yCss)
      await sleep(FULLPAGE_AFTER_SCROLL_MS)
      actual = await readScrollYCssInTab(tabId)
      if (!isFullpageScrollAtTarget(yCss, actual)) {
        throw new Error(`滚动未到位（目标 ${yCss}px，实际 ${actual}px）`)
      }
    }
  }

  await sleep(FULLPAGE_AFTER_SCROLL_MS)
}

export async function applyFullpageLastFrameFloatingHides(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      ;(globalThis as G).__assetVaultFullpage?.applyLastFrameFloatingHides()
    },
  })
}

export async function restoreFullpageInTab(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      ;(globalThis as G).__assetVaultFullpage?.restore()
    },
  }).catch(() => null)
}
