import type { VideoPlatform } from './video-page-url-rules'

export type PageVideoCookiePair = { name: string; value: string }

/** Context passed to site-specific cookie readers. */
export type PlatformCookieReadContext = {
  pageUrl: string
  tabId?: number
  storeIds: ReadonlyArray<string | undefined>
}

/**
 * Per-platform cookie acquisition overrides.
 * Sites without an entry use generic Chrome reads only.
 */
export type PlatformCookieStrategy = {
  extraSubdomainPrefixes?: readonly string[]
  loginCookieNames?: readonly string[]
  hasLoginCookies: (cookies: ReadonlyArray<PageVideoCookiePair>) => boolean
  readPlatformCookies?: (ctx: PlatformCookieReadContext) => Promise<PageVideoCookiePair[]>
}

export type PageVideoCookiesBrowser = 'edge' | 'chrome' | 'firefox' | 'none'

export type PageVideoCookieFields = {
  cookiesFromBrowser: 'none'
  cookieHeader?: string
}

/** Pick browser profile for Pro `--cookies-from-browser` (non-extension callers only). */
export function detectPageVideoCookiesBrowser(userAgent: string): PageVideoCookiesBrowser {
  if (/Edg\//.test(userAgent)) return 'edge'
  if (/Firefox\//.test(userAgent)) return 'firefox'
  if (/Chrome\//.test(userAgent)) return 'chrome'
  return 'edge'
}

export type CookieReader = (
  pageUrl: string,
  opts?: { tabId?: number; platform?: VideoPlatform }
) => Promise<PageVideoCookiePair[]>

// ── Site strategies: add new platforms here ────────────────────────────────

const BILIBILI_STRATEGY: PlatformCookieStrategy = {
  extraSubdomainPrefixes: ['data'],
  loginCookieNames: ['SESSDATA', 'DedeUserID', 'DedeUserID_ckMd5', 'bili_jct', 'sid'],
  hasLoginCookies(cookies) {
    const names = new Set(cookies.map((c) => c.name))
    return names.has('SESSDATA') || (names.has('DedeUserID') && names.has('bili_jct'))
  }
}

const DOUYIN_STRATEGY: PlatformCookieStrategy = {
  loginCookieNames: ['sessionid', 'sid_tt'],
  hasLoginCookies(cookies) {
    const names = new Set(cookies.map((c) => c.name))
    return names.has('sessionid') || names.has('sid_tt')
  }
}

const XIAOHONGSHU_STRATEGY: PlatformCookieStrategy = {
  loginCookieNames: ['web_session', 'a1'],
  hasLoginCookies(cookies) {
    const names = new Set(cookies.map((c) => c.name))
    return names.has('web_session') || names.has('a1')
  }
}

const GENERIC_LOGIN_STRATEGY: PlatformCookieStrategy = {
  hasLoginCookies: (cookies) => cookies.length > 0
}

export const PLATFORM_COOKIE_STRATEGIES: Partial<Record<VideoPlatform, PlatformCookieStrategy>> = {
  bilibili: BILIBILI_STRATEGY,
  douyin: DOUYIN_STRATEGY,
  xiaohongshu: XIAOHONGSHU_STRATEGY
}

export function getPlatformCookieStrategy(
  platform?: VideoPlatform
): PlatformCookieStrategy | null {
  if (!platform) return null
  return PLATFORM_COOKIE_STRATEGIES[platform] ?? null
}

export function hasPlatformLoginCookies(
  platform: VideoPlatform,
  cookies: ReadonlyArray<PageVideoCookiePair>
): boolean {
  const strategy = getPlatformCookieStrategy(platform)
  return (strategy ?? GENERIC_LOGIN_STRATEGY).hasLoginCookies(cookies)
}

/** Platforms with a dedicated login-cookie strategy (must pass before submit). */
export function platformRequiresLoginCookies(platform: VideoPlatform): boolean {
  return getPlatformCookieStrategy(platform) !== null
}

/** Public platforms: do not send page cookies (avoids yt-dlp YouTube web-client failures). */
export function shouldAttachPageVideoCookies(platform: VideoPlatform): boolean {
  return platformRequiresLoginCookies(platform)
}

const PLATFORM_DISPLAY_NAMES: Partial<Record<VideoPlatform, string>> = {
  bilibili: 'B 站',
  douyin: '抖音',
  xiaohongshu: '小红书'
}

export function platformDisplayName(platform: VideoPlatform): string {
  return PLATFORM_DISPLAY_NAMES[platform] ?? '当前站点'
}

export function cookiePairsToFields(pairs: ReadonlyArray<PageVideoCookiePair>): PageVideoCookieFields {
  const cookieHeader = formatCookieHeader(pairs)
  return cookieHeader ? { cookiesFromBrowser: 'none', cookieHeader } : { cookiesFromBrowser: 'none' }
}

// ── Generic domain / header helpers (shared by all platforms) ──────────────

export const GENERIC_SUBDOMAIN_PREFIXES = ['www', 'api', 'account', 'm'] as const

export function registrableCookieDomain(hostname: string): string | null {
  const host = hostname.replace(/^www\./i, '')
  const parts = host.split('.').filter(Boolean)
  if (parts.length < 2) return null
  return parts.slice(-2).join('.')
}

export function cookieLookupUrls(
  pageUrl: string,
  strategy?: PlatformCookieStrategy | null
): string[] {
  let u: URL
  try {
    u = new URL(pageUrl)
  } catch {
    return [pageUrl]
  }
  const prefixes = new Set<string>([...GENERIC_SUBDOMAIN_PREFIXES])
  for (const prefix of strategy?.extraSubdomainPrefixes ?? []) {
    prefixes.add(prefix)
  }

  const out = new Set<string>([pageUrl, `${u.origin}/`])
  const reg = registrableCookieDomain(u.hostname)
  if (reg) {
    for (const prefix of prefixes) {
      out.add(`https://${prefix}.${reg}/`)
    }
    out.add(`https://${reg}/`)
  }
  return [...out]
}

export function cookieDomainsForPageUrl(pageUrl: string): string[] {
  let hostname: string
  try {
    hostname = new URL(pageUrl).hostname
  } catch {
    return []
  }
  const reg = registrableCookieDomain(hostname)
  const out = new Set<string>()
  if (hostname) {
    out.add(hostname)
    out.add(`.${hostname}`)
  }
  if (reg) {
    out.add(reg)
    out.add(`.${reg}`)
    out.add(`www.${reg}`)
    out.add(`.www.${reg}`)
  }
  return [...out]
}

export function mergeCookiesByName(
  lists: ReadonlyArray<ReadonlyArray<PageVideoCookiePair>>
): PageVideoCookiePair[] {
  const seen = new Map<string, PageVideoCookiePair>()
  for (const list of lists) {
    for (const c of list) {
      if (c.name) seen.set(c.name, c)
    }
  }
  return [...seen.values()]
}

export function cookieDomainMatchesPage(cookieDomain: string, pageUrl: string): boolean {
  let hostname: string
  try {
    hostname = new URL(pageUrl).hostname.toLowerCase()
  } catch {
    return false
  }
  const reg = registrableCookieDomain(hostname)
  const d = cookieDomain.startsWith('.') ? cookieDomain.slice(1).toLowerCase() : cookieDomain.toLowerCase()
  if (!d) return false
  if (hostname === d || hostname.endsWith(`.${d}`)) return true
  if (d.endsWith(hostname)) return true
  if (reg && (d === reg || d.endsWith(`.${reg}`) || d === `www.${reg}`)) return true
  return false
}

export function formatCookieHeader(cookies: ReadonlyArray<PageVideoCookiePair>): string | undefined {
  const parts: string[] = []
  for (const c of cookies) {
    if (!c.name) continue
    parts.push(`${c.name}=${c.value}`)
  }
  return parts.length ? parts.join('; ') : undefined
}

export function parseCookieHeader(header: string): PageVideoCookiePair[] {
  return header
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const i = part.indexOf('=')
      if (i < 1) return { name: '', value: '' }
      return { name: part.slice(0, i).trim(), value: part.slice(i + 1).trim() }
    })
    .filter((c) => c.name)
}

export async function readPageVideoCookiePairs(args: {
  cookieUrls: string[]
  tabId?: number
  cookieHeader?: string
  platform?: VideoPlatform
  getCookies?: CookieReader
}): Promise<PageVideoCookiePair[]> {
  if (args.cookieHeader?.trim()) {
    return parseCookieHeader(args.cookieHeader.trim())
  }
  if (!args.getCookies) return []

  const lists: PageVideoCookiePair[][] = []
  for (const pageUrl of args.cookieUrls) {
    if (!pageUrl) continue
    try {
      lists.push(await args.getCookies(pageUrl, { tabId: args.tabId, platform: args.platform }))
    } catch {
      /* permission denied */
    }
  }
  return mergeCookiesByName(lists)
}

export async function resolvePageVideoCookieFields(args: {
  cookieUrls: string[]
  tabId?: number
  cookieHeader?: string
  platform?: VideoPlatform
  getCookies?: CookieReader
}): Promise<PageVideoCookieFields> {
  if (args.cookieHeader?.trim()) {
    return { cookiesFromBrowser: 'none', cookieHeader: args.cookieHeader.trim() }
  }

  const pairs = await readPageVideoCookiePairs(args)
  return cookiePairsToFields(pairs)
}
