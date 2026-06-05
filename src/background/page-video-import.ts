import { assignTags, pingApp, updateAsset } from '../shared/api'
import { getPreferences } from '../shared/config'
import { ensureHostPermissionForUrl, HOST_PERMISSION_DENIED_MSG } from '../shared/host-permissions'
import {
  cookiePairsToFields,
  hasPlatformLoginCookies,
  platformDisplayName,
  platformRequiresLoginCookies,
  shouldAttachPageVideoCookies,
  readPageVideoCookiePairs,
  type PageVideoCookieFields,
  type PageVideoCookiePair
} from '../shared/page-video-import-cookies'
import {
  pageVideoErrorMessage,
  parseApiError,
  summarizePageVideoJob
} from '../shared/page-video-import-errors'
import {
  pageVideoImportBatch,
  pageVideoImportCreate,
  pollPageVideoJobUntilDone,
  supportsPageVideoImportApi
} from '../shared/page-video-import-api'
import type { PageVideoCreateBody, PageVideoJob } from '../shared/page-video-import-types'
import { resolveVideoPageContext, type VideoPageContext, type VideoPlatform } from '../shared/video-page-url-rules'
import { resolveVideoPageContextAsync } from '../shared/video-page-url-resolve'
import { ConcurrencyQueue } from '../shared/concurrency'
import { ensureContentScriptForTab, injectableTabMessage } from '../shared/tab-messaging'

const PAGE_VIDEO_POLL_CONCURRENCY = 4

export type PageVideoImportItem = {
  url: string
  platform?: string
  pageTitle?: string
}

const activeJobs = new Map<string, AbortController>()

export function abortPageVideoImportJob(jobId: string): void {
  activeJobs.get(jobId)?.abort()
}

type AppInfo = Awaited<ReturnType<typeof pingApp>>

function describePageVideoBlockReason(
  apiSupported: boolean,
  app: AppInfo | null
): string | undefined {
  if (apiSupported) {
    if (app?.ytdlp?.ready === false) {
      return 'Pro 未检测到 yt-dlp，请在 Pro 目录执行 pnpm run fetch:ytdlp 后重启'
    }
    return undefined
  }
  if (!app) {
    return '无法连接 AssetVault Pro，请确认桌面端已启动并在设置中启用 Web API'
  }
  return '本机 Pro 版本过旧或未包含 pageVideoImport API，请更新并重启 Pro'
}

export async function getPageVideoCapabilitiesForTab(
  tab: chrome.tabs.Tab
): Promise<{
  apiSupported: boolean
  isVideoPage: boolean
  platform: string | null
  canonicalUrl: string | null
  proVersion?: string
  ytdlpVersion?: string | null
  ytdlpReady?: boolean
  blockReason?: string
}> {
  const [apiSupported, ctx, app] = await Promise.all([
    supportsPageVideoImportApi().catch(() => false),
    resolveContextForTab(tab),
    pingApp().catch(() => null) as Promise<AppInfo | null>
  ])
  const ytdlpReady = app?.ytdlp?.ready ?? Boolean(app?.ytdlp?.version)
  return {
    apiSupported,
    isVideoPage: ctx !== null,
    platform: ctx?.platform ?? null,
    canonicalUrl: ctx?.url ?? null,
    proVersion: app?.version,
    ytdlpVersion: app?.ytdlp?.version ?? null,
    ytdlpReady,
    blockReason: describePageVideoBlockReason(apiSupported, app)
  }
}

async function resolveContextForTab(tab: chrome.tabs.Tab): Promise<VideoPageContext | null> {
  const fromTab = tab.url ? resolveVideoPageContext(tab.url) : null
  if (fromTab) return fromTab
  if (!tab.id) return null
  const blocked = injectableTabMessage(tab.url)
  if (blocked) return null
  try {
    await ensureContentScriptForTab(tab.id)
    const resp = (await chrome.tabs.sendMessage(tab.id, {
      type: 'PAGE_VIDEO_CONTEXT'
    })) as { ok?: boolean; context?: VideoPageContext | null }
    if (resp?.ok && resp.context) return resp.context
  } catch {
    /* content not ready */
  }
  return null
}

export function validatePageVideoCookies(
  platform: VideoPlatform,
  cookieFields: PageVideoCookieFields,
  cookiePairs: PageVideoCookiePair[]
): string | null {
  if (!platformRequiresLoginCookies(platform)) return null

  const hasHeader = Boolean(cookieFields.cookieHeader?.trim())
  const hasLogin = hasPlatformLoginCookies(platform, cookiePairs)
  const site = platformDisplayName(platform)

  if (!hasHeader && cookiePairs.length === 0) {
    return (
      `未能读取 ${site} Cookie。请确认：① 当前标签页为已登录的 ${site} 视频页；` +
      '② 已重载扩展；③ edge://extensions 中站点访问为「在所有站点上」'
    )
  }
  if (!hasLogin) {
    return `未检测到 ${site} 登录 Cookie，请刷新页面确认已登录后再试`
  }
  return null
}

async function buildCreateBody(
  ctx: VideoPageContext,
  tab: chrome.tabs.Tab,
  prefs: Awaited<ReturnType<typeof getPreferences>>,
  cookieFields: PageVideoCookieFields
): Promise<PageVideoCreateBody> {
  return {
    url: ctx.url,
    platform: ctx.platform,
    targetFolderId: prefs.defaultFolderId || undefined,
    duplicatePolicy: prefs.duplicatePolicy,
    formatPreset: prefs.pageVideoFormatPreset,
    ...cookieFields,
    sourceMeta: {
      pageUrl: tab.url ?? ctx.url,
      pageTitle: tab.title ?? undefined,
      submittedBy: 'extension',
      tabId: tab.id
    },
    options: { noPlaylist: true }
  }
}

async function pollWithNotify(
  jobId: string,
  tabId: number,
  notify: (tabId: number, text: string) => Promise<void>
): Promise<PageVideoJob> {
  const ac = new AbortController()
  activeJobs.set(jobId, ac)
  try {
    return await pollPageVideoJobUntilDone(jobId, {
      signal: ac.signal,
      onProgress: (job) => {
        if (job.status !== 'running') return
        const pct =
          job.progressPercent != null ? ` ${Math.round(job.progressPercent)}%` : ''
        const stage = job.stage ?? 'downloading'
        void notify(tabId, `视频导入中（${stage}）${pct}`)
      }
    })
  } finally {
    activeJobs.delete(jobId)
  }
}

export type PageVideoImportPrep = {
  ctx: VideoPageContext
  prefs: Awaited<ReturnType<typeof getPreferences>>
  cookieFields: PageVideoCookieFields
}

async function prepareCookieFieldsForContext(args: {
  cookieUrls: string[]
  tabId: number
  platform: VideoPlatform
  cookieHeader?: string
}): Promise<
  | { ok: true; cookieFields: PageVideoCookieFields; cookiePairs: PageVideoCookiePair[] }
  | { ok: false; error: string }
> {
  if (!shouldAttachPageVideoCookies(args.platform)) {
    return { ok: true, cookieFields: { cookiesFromBrowser: 'none' }, cookiePairs: [] }
  }

  const cookiePairs = await readPageVideoCookiePairs({
    cookieUrls: args.cookieUrls,
    tabId: args.tabId,
    cookieHeader: args.cookieHeader,
    platform: args.platform
  })
  const cookieFields = args.cookieHeader?.trim()
    ? { cookiesFromBrowser: 'none' as const, cookieHeader: args.cookieHeader.trim() }
    : cookiePairsToFields(cookiePairs)
  const cookieError = validatePageVideoCookies(args.platform, cookieFields, cookiePairs)
  if (cookieError) return { ok: false, error: cookieError }
  return { ok: true, cookieFields, cookiePairs }
}

/** Fast validation before enqueueing a long-running Pro job. */
export async function preflightPageVideoImport(args: {
  tab: chrome.tabs.Tab
  url?: string
  cookieHeader?: string
}): Promise<{ ok: true; prep: PageVideoImportPrep } | { ok: false; error: string }> {
  const tabId = args.tab.id
  if (!tabId) return { ok: false, error: '无法定位当前标签页' }

  const blocked = injectableTabMessage(args.tab.url)
  if (blocked) return { ok: false, error: blocked }

  if (!(await supportsPageVideoImportApi())) {
    return { ok: false, error: pageVideoErrorMessage('PRO_FEATURE_UNAVAILABLE') }
  }

  let ctx: VideoPageContext | null = null
  if (args.url) {
    ctx = await resolveVideoPageContextAsync(args.url)
  } else {
    ctx = await resolveContextForTab(args.tab)
  }

  if (!ctx) {
    return { ok: false, error: pageVideoErrorMessage('PAGE_VIDEO_NOT_SUPPORTED') }
  }

  const cookieSourceUrl = args.tab.url ?? ctx.url
  if (cookieSourceUrl) {
    const granted = await ensureHostPermissionForUrl(cookieSourceUrl)
    if (!granted) {
      return { ok: false, error: HOST_PERMISSION_DENIED_MSG }
    }
  }

  const prefs = await getPreferences()
  const cookieUrls = [args.tab.url, ctx.url].filter((u): u is string => Boolean(u))
  const cookies = await prepareCookieFieldsForContext({
    cookieUrls,
    tabId,
    platform: ctx.platform,
    cookieHeader: args.cookieHeader
  })
  if (!cookies.ok) return { ok: false, error: cookies.error }

  return { ok: true, prep: { ctx, prefs, cookieFields: cookies.cookieFields } }
}

export async function orchestratePageVideoImport(args: {
  tab: chrome.tabs.Tab
  url?: string
  notify: (tabId: number, text: string) => Promise<void>
  onJobStarted?: (tabId: number, jobId: string) => Promise<void>
  onJobFinished?: (tabId: number, job: PageVideoJob) => Promise<void>
  tagIds?: string[]
  prep?: PageVideoImportPrep
}): Promise<{ ok: true; jobId: string; job: PageVideoJob } | { ok: false; error: string }> {
  const tabId = args.tab.id
  if (!tabId) return { ok: false, error: '无法定位当前标签页' }

  const fail = async (error: string) => {
    await args.notify(tabId, error)
    return { ok: false as const, error }
  }

  const ready = args.prep
    ? { ok: true as const, prep: args.prep }
    : await preflightPageVideoImport({ tab: args.tab, url: args.url })
  if (!ready.ok) return fail(ready.error)

  const { ctx, prefs, cookieFields } = ready.prep

  try {
    await args.notify(tabId, '已提交视频导入任务…')
    const created = await pageVideoImportCreate(
      await buildCreateBody(ctx, args.tab, prefs, cookieFields)
    )
    await args.onJobStarted?.(tabId, created.jobId)
    const job = await pollWithNotify(created.jobId, tabId, args.notify)

    if (job.status === 'completed' && job.assetId && !job.skipped) {
      if (args.tagIds?.length) {
        await assignTags([job.assetId], args.tagIds).catch(() => {})
      }
      const sourceUrl = args.tab.url ?? ctx.url
      await updateAsset({ id: job.assetId, sourceUrl }).catch(() => {})
    }

    await args.notify(tabId, summarizePageVideoJob(job))
    await args.onJobFinished?.(tabId, job)
    return { ok: true, jobId: created.jobId, job }
  } catch (e) {
    const { message } = parseApiError(e)
    await args.notify(tabId, message)
    return { ok: false, error: message }
  }
}

const PAGE_VIDEO_BATCH_MAX = 50

export async function orchestratePageVideoImportBatch(args: {
  tab: chrome.tabs.Tab
  items: PageVideoImportItem[]
  notify: (tabId: number, text: string) => Promise<void>
  onJobFinished?: (tabId: number, job: PageVideoJob) => Promise<void>
}): Promise<
  | { ok: true; succeeded: number; failed: number; skippedCount: number; batchId: string }
  | { ok: false; error: string }
> {
  const tabId = args.tab.id
  if (!tabId) return { ok: false, error: '无法定位当前标签页' }

  if (!(await supportsPageVideoImportApi())) {
    return { ok: false, error: pageVideoErrorMessage('PRO_FEATURE_UNAVAILABLE') }
  }

  if (args.items.length > PAGE_VIDEO_BATCH_MAX) {
    return {
      ok: false,
      error: `批量最多 ${PAGE_VIDEO_BATCH_MAX} 条，请拆分后重试`
    }
  }

  const prefs = await getPreferences()
  const tabCookieUrls = [args.tab.url].filter((u): u is string => Boolean(u))
  const bodies: PageVideoCreateBody[] = []
  let skipped = 0

  for (const item of args.items) {
    const ctx = await resolveVideoPageContextAsync(item.url)
    if (!ctx) {
      skipped++
      continue
    }

    const cookieUrls = [...tabCookieUrls, ctx.url]
    const cookies = await prepareCookieFieldsForContext({
      cookieUrls,
      tabId,
      platform: ctx.platform
    })
    if (!cookies.ok) {
      skipped++
      continue
    }

    bodies.push({
      url: ctx.url,
      platform: item.platform ?? ctx.platform,
      targetFolderId: prefs.defaultFolderId || undefined,
      duplicatePolicy: prefs.duplicatePolicy,
      formatPreset: prefs.pageVideoFormatPreset,
      ...cookies.cookieFields,
      sourceMeta: {
        pageUrl: ctx.url,
        pageTitle: item.pageTitle,
        submittedBy: 'extension',
        tabId
      },
      options: { noPlaylist: true }
    })
  }

  if (!bodies.length) {
    const hint =
      skipped > 0
        ? `无有效条目（${skipped} 条因链接或 Cookie 未通过校验）`
        : pageVideoErrorMessage('PAGE_VIDEO_NOT_SUPPORTED')
    return { ok: false, error: hint }
  }

  try {
    const batch = await pageVideoImportBatch({
      items: bodies,
      targetFolderId: prefs.defaultFolderId || undefined,
      duplicatePolicy: prefs.duplicatePolicy,
      formatPreset: prefs.pageVideoFormatPreset,
      cookiesFromBrowser: 'none'
    })

    let succeeded = 0
    let failed = 0
    const total = batch.jobs.length
    const queue = new ConcurrencyQueue(PAGE_VIDEO_POLL_CONCURRENCY)
    let done = 0
    const failedJobs: PageVideoJob[] = []

    const outcomes = await Promise.all(
      batch.jobs.map(({ jobId }) =>
        queue.add(async () => {
          const n = ++done
          await args.notify(tabId, `批量视频导入 ${n}/${total}…`)
          try {
            const job = await pollWithNotify(jobId, tabId, args.notify)
            if (job.status === 'completed') return 'ok'
            if (job.status === 'failed') {
              failedJobs.push(job)
              await args.onJobFinished?.(tabId, job)
            }
            return 'fail'
          } catch {
            return 'fail'
          }
        }),
      ),
    )
    for (const o of outcomes) {
      if (o === 'ok') succeeded++
      else failed++
    }

    const skipNote = skipped > 0 ? `，跳过 ${skipped}` : ''
    let summary = `批量导入完成：成功 ${succeeded}，失败 ${failed}${skipNote}`
    if (failedJobs.length > 0) {
      const first = failedJobs[0]
      summary += `\n首条失败：${summarizePageVideoJob(first)}`
    }
    await args.notify(tabId, summary)
    return { ok: true, succeeded, failed, skippedCount: skipped, batchId: batch.batchId }
  } catch (e) {
    const { message } = parseApiError(e)
    await args.notify(tabId, message)
    return { ok: false, error: message }
  }
}

export async function orchestratePageVideoImportFromText(args: {
  tab: chrome.tabs.Tab
  lines: string[]
  notify: (tabId: number, text: string) => Promise<void>
}): Promise<
  | { ok: true; succeeded: number; failed: number; invalidLineCount: number }
  | { ok: false; error: string }
> {
  const tabId = args.tab.id
  if (!tabId) return { ok: false, error: '无法定位当前标签页' }

  const seen = new Set<string>()
  const items: PageVideoImportItem[] = []
  let invalidLineCount = 0

  for (const line of args.lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const ctx = await resolveVideoPageContextAsync(trimmed)
    if (!ctx) {
      invalidLineCount++
      continue
    }
    if (seen.has(ctx.url)) continue
    seen.add(ctx.url)
    items.push({ url: ctx.url, platform: ctx.platform, pageTitle: args.tab.title ?? undefined })
  }

  if (!items.length) {
    return {
      ok: false,
      error:
        invalidLineCount > 0
          ? pageVideoErrorMessage('PAGE_VIDEO_NOT_SUPPORTED')
          : '未解析到有效的视频作品 URL（每行一条）'
    }
  }

  const batch = await orchestratePageVideoImportBatch({
    tab: args.tab,
    items,
    notify: args.notify
  })
  if (!batch.ok) return batch
  return {
    ok: true,
    succeeded: batch.succeeded,
    failed: batch.failed,
    invalidLineCount
  }
}
