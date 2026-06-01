import { isInjectableTabUrl } from './collect-meta-core'

/** Chrome optional_host_permissions pattern for a page URL, e.g. `https://example.com/*`. */
export function originPatternFromUrl(url: string): string | null {
  if (!isInjectableTabUrl(url)) return null
  try {
    return `${new URL(url).origin}/*`
  } catch {
    return null
  }
}

export async function hasHostPermissionForUrl(url: string): Promise<boolean> {
  const pattern = originPatternFromUrl(url)
  if (!pattern) return false
  return chrome.permissions.contains({ origins: [pattern] })
}

/** Request optional host permission for the tab's origin (user gesture required). */
export async function ensureHostPermissionForUrl(url: string): Promise<boolean> {
  const pattern = originPatternFromUrl(url)
  if (!pattern) return false
  if (await chrome.permissions.contains({ origins: [pattern] })) return true
  try {
    return await chrome.permissions.request({ origins: [pattern] })
  } catch {
    return false
  }
}

export async function ensureHostPermissionForTab(tabId: number): Promise<boolean> {
  const tab = await chrome.tabs.get(tabId)
  if (!tab.url) return false
  return ensureHostPermissionForUrl(tab.url)
}

export const HOST_PERMISSION_DENIED_MSG =
  '需要允许访问当前网站才能采集。请在浏览器弹窗中点击「允许」；若未出现弹窗，可能是企业策略限制，请到 chrome://extensions → 本扩展 → 站点访问 中手动开启。'
