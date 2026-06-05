import {
  getPlatformCookieStrategy,
  mergeCookiesByName,
  cookieLookupUrls,
  cookieDomainsForPageUrl,
  cookieDomainMatchesPage,
  formatCookieHeader,
  readPageVideoCookiePairs as readPageVideoCookiePairsCore,
  resolvePageVideoCookieFields as resolvePageVideoCookieFieldsCore,
  type CookieReader,
  type PageVideoCookiePair,
  type PageVideoCookieFields,
  type PlatformCookieStrategy
} from './page-video-import-cookie-strategies'
export {
  cookieDomainMatchesPage,
  cookieDomainsForPageUrl,
  cookieLookupUrls,
  detectPageVideoCookiesBrowser,
  formatCookieHeader,
  cookiePairsToFields,
  hasPlatformLoginCookies,
  mergeCookiesByName,
  parseCookieHeader,
  platformDisplayName,
  platformRequiresLoginCookies,
  shouldAttachPageVideoCookies,
  registrableCookieDomain,
  getPlatformCookieStrategy,
  PLATFORM_COOKIE_STRATEGIES,
  type CookieReader,
  type PageVideoCookiePair,
  type PageVideoCookieFields,
  type PageVideoCookiesBrowser
} from './page-video-import-cookie-strategies'
import type { VideoPlatform } from './video-page-url-rules'

function toPairs(list: chrome.cookies.Cookie[]): PageVideoCookiePair[] {
  return list.map((c) => ({ name: c.name, value: c.value }))
}

function chromeStoreBase(storeId?: string): chrome.cookies.GetAllDetails {
  return storeId ? { storeId } : {}
}

async function listCookieStoreIds(tabId?: number): Promise<(string | undefined)[]> {
  const ids = new Set<string | undefined>([undefined])
  if (typeof chrome === 'undefined' || !chrome.cookies?.getAllCookieStores) return [...ids]
  try {
    for (const store of await chrome.cookies.getAllCookieStores()) {
      ids.add(store.id)
    }
  } catch {
    /* ignore */
  }
  if (tabId != null) {
    try {
      const tab = await chrome.tabs.get(tabId)
      const sid = (tab as chrome.tabs.Tab & { cookieStoreId?: string }).cookieStoreId
      if (sid) ids.add(sid)
    } catch {
      /* tab gone */
    }
  }
  return [...ids]
}

function pageOrigin(pageUrl: string): string | null {
  try {
    return new URL(pageUrl).origin
  } catch {
    return null
  }
}

async function getCookiesByNames(
  names: ReadonlyArray<string>,
  urls: ReadonlyArray<string>,
  storeIds: ReadonlyArray<string | undefined>
): Promise<PageVideoCookiePair[]> {
  if (typeof chrome === 'undefined' || !chrome.cookies?.get) return []
  const pairs: PageVideoCookiePair[] = []
  for (const storeId of storeIds) {
    const base = chromeStoreBase(storeId)
    for (const url of urls) {
      for (const name of names) {
        try {
          const c = await chrome.cookies.get({ ...base, url, name })
          if (c?.name) pairs.push({ name: c.name, value: c.value })
        } catch {
          /* missing host permission */
        }
      }
    }
  }
  return pairs
}

async function queryGenericCookiesForStore(
  pageUrl: string,
  storeId: string | undefined,
  strategy: PlatformCookieStrategy | null
): Promise<PageVideoCookiePair[]> {
  if (typeof chrome === 'undefined' || !chrome.cookies?.getAll) return []

  const base = chromeStoreBase(storeId)
  const lists: PageVideoCookiePair[][] = []
  const lookupUrls = cookieLookupUrls(pageUrl, strategy)
  const origin = pageOrigin(pageUrl)

  for (const url of lookupUrls) {
    try {
      lists.push(toPairs(await chrome.cookies.getAll({ ...base, url })))
    } catch {
      /* missing host permission */
    }
    if (origin) {
      try {
        lists.push(
          toPairs(
            await chrome.cookies.getAll({
              ...base,
              url,
              partitionKey: { topLevelSite: origin }
            } as chrome.cookies.GetAllDetails)
          )
        )
      } catch {
        /* partitionKey unsupported or denied */
      }
    }
  }

  for (const domain of cookieDomainsForPageUrl(pageUrl)) {
    try {
      lists.push(toPairs(await chrome.cookies.getAll({ ...base, domain })))
    } catch {
      /* ignore */
    }
  }

  if (origin) {
    try {
      lists.push(
        toPairs(
          await chrome.cookies.getAll({
            ...base,
            partitionKey: { topLevelSite: origin }
          } as chrome.cookies.GetAllDetails)
        )
      )
    } catch {
      /* ignore */
    }
  }

  try {
    const all = await chrome.cookies.getAll(base)
    lists.push(toPairs(all.filter((c) => cookieDomainMatchesPage(c.domain, pageUrl))))
  } catch {
    /* ignore */
  }

  const loginNames = strategy?.loginCookieNames
  if (loginNames?.length) {
    lists.push(await getCookiesByNames(loginNames, lookupUrls, [storeId]))
  }

  return mergeCookiesByName(lists)
}

/** Generic Chrome read + optional platform strategy merge. */
export async function readChromeCookiesForPage(
  pageUrl: string,
  opts?: { tabId?: number; platform?: VideoPlatform }
): Promise<PageVideoCookiePair[]> {
  if (typeof chrome === 'undefined' || !chrome.cookies?.getAll) return []

  const strategy = getPlatformCookieStrategy(opts?.platform)
  const storeIds = await listCookieStoreIds(opts?.tabId)
  const lists: PageVideoCookiePair[][] = []

  for (const storeId of storeIds) {
    lists.push(await queryGenericCookiesForStore(pageUrl, storeId, strategy))
  }

  if (strategy?.readPlatformCookies) {
    lists.push(
      await strategy.readPlatformCookies({
        pageUrl,
        tabId: opts?.tabId,
        storeIds
      })
    )
  }

  return mergeCookiesByName(lists)
}

export async function readPageVideoCookiePairs(args: {
  cookieUrls: string[]
  tabId?: number
  cookieHeader?: string
  platform?: VideoPlatform
  getCookies?: CookieReader
}): Promise<PageVideoCookiePair[]> {
  return readPageVideoCookiePairsCore({
    ...args,
    getCookies: args.getCookies ?? readChromeCookiesForPage
  })
}

export async function resolvePageVideoCookieFields(args: {
  cookieUrls: string[]
  tabId?: number
  cookieHeader?: string
  platform?: VideoPlatform
  getCookies?: CookieReader
}): Promise<PageVideoCookieFields> {
  return resolvePageVideoCookieFieldsCore({
    ...args,
    getCookies: args.getCookies ?? readChromeCookiesForPage
  })
}

export async function collectPageVideoCookieFieldsForTab(
  tab: chrome.tabs.Tab,
  ctx: { url: string; platform?: VideoPlatform }
): Promise<PageVideoCookieFields> {
  const cookieUrls = [tab.url, ctx.url].filter((u): u is string => Boolean(u))
  return resolvePageVideoCookieFields({
    cookieUrls,
    tabId: tab.id ?? undefined,
    platform: ctx.platform
  })
}

export async function readPageVideoCookieHeaderForTab(args: {
  tab: chrome.tabs.Tab
  platform?: VideoPlatform
}): Promise<string | undefined> {
  const cookieUrls = [args.tab.url].filter((u): u is string => Boolean(u))
  if (!cookieUrls.length) return undefined
  const pairs = await readPageVideoCookiePairs({
    cookieUrls,
    tabId: args.tab.id ?? undefined,
    platform: args.platform
  })
  return formatCookieHeader(pairs)
}
