import {
  articleBundleSessionStart,
  articleBundleSessionAppend,
  articleBundleSessionFinish,
  releaseArticleBundleSessionOnFailure,
} from './article-bundle-session-api'
import {
  ARTICLE_BUNDLE_THUMB_RELATIVE,
  sanitizeMarkdownBundleFilename,
} from './article-bundle-session-paths'
import { blobToBase64DataUrl, dataUrlFitsDirectImport, dataUrlToBlob } from './data-url-import'

export interface ArticleBundleFile {
  relativePath: string
  /** Prefer dataUrl when already available (e.g. captureVisibleTab). */
  dataUrl?: string
  blob?: Blob
}

export interface ArticleBundleSessionImportArgs {
  pageUrl: string
  pageTitle: string
  markdownFilename: string
  targetFolderId?: string | null
  files: ArticleBundleFile[]
  shouldAbort?: () => boolean
}

export interface ArticleBundleSessionImportResult {
  assetId?: string
  warnings: string[]
  skipped?: boolean
  tempDir?: string
}

/** Pro allows ~100MB per file in append body (base64 overhead included). */
const MAX_SINGLE_FILE_BYTES = 95 * 1024 * 1024
const MAX_DATA_URL_JSON_CHARS = 130 * 1024 * 1024

/** Only one bundle import at a time — parallel starts abort each other's sessions on Pro. */
let bundleImportChain: Promise<void> = Promise.resolve()

function runExclusiveBundleImport<T>(fn: () => Promise<T>): Promise<T> {
  const run = bundleImportChain.then(fn)
  bundleImportChain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

function formatArticleBundleApiError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/ARTICLE_BUNDLE_SESSION_NOT_FOUND|ARTICLE_BUNDLE_SESSION_EXPIRED/i.test(msg)) {
    return 'Markdown 会话已失效（请勿重复点击导出；若刚重启 Pro 请重试）'
  }
  if (/ARTICLE_BUNDLE_SESSION_LIMIT/i.test(msg)) {
    return '桌面端活跃 Markdown 会话过多，请稍后重试'
  }
  if (/LIBRARY_NOT_OPEN|LIBRARY_NOT_READY/i.test(msg)) {
    return '资料库未打开，请先在 AssetVault Pro 中打开资料库'
  }
  if (/ARTICLE_BUNDLE_PATH_DENIED|ARTICLE_BUNDLE_FILE_NOT_FOUND/i.test(msg)) {
    return `文件路径校验失败: ${msg}`
  }
  if (/ARTICLE_BUNDLE_INCOMPLETE/i.test(msg)) {
    return '资料包不完整（缺少 Markdown 或缩略图）'
  }
  if (/INVALID_REQUEST/i.test(msg)) {
    return '请求参数无效（请确认 Pro 与扩展均为最新版本）'
  }
  if (/body too large|请求体过大/i.test(msg)) {
    return '单文件过大，请减少正文图片数量后重试'
  }
  return msg
}

async function fileToBase64DataUrl(file: ArticleBundleFile): Promise<string> {
  if (file.dataUrl?.startsWith('data:')) {
    if (!/^data:[^;]*;base64,/i.test(file.dataUrl)) {
      return blobToBase64DataUrl(dataUrlToBlob(file.dataUrl))
    }
    if (file.dataUrl.length < 32) {
      throw new Error(`文件 ${file.relativePath} 内容为空`)
    }
    return file.dataUrl
  }
  if (!file.blob) {
    throw new Error(`文件 ${file.relativePath} 无数据`)
  }
  if (file.blob.size === 0) {
    throw new Error(`文件 ${file.relativePath} 内容为空`)
  }
  if (file.blob.size > MAX_SINGLE_FILE_BYTES) {
    throw new Error(
      `文件 ${file.relativePath} 超过单文件上限（${Math.round(file.blob.size / 1024 / 1024)}MB）`,
    )
  }
  return blobToBase64DataUrl(file.blob)
}

export async function importArticleBundleViaSession(
  args: ArticleBundleSessionImportArgs,
): Promise<ArticleBundleSessionImportResult> {
  return runExclusiveBundleImport(() => importArticleBundleViaSessionInner(args))
}

async function importArticleBundleViaSessionInner(
  args: ArticleBundleSessionImportArgs,
): Promise<ArticleBundleSessionImportResult> {
  let sessionId: string | null = null

  const markdownFilename = sanitizeMarkdownBundleFilename(args.markdownFilename)

  try {
    const startBody = {
      output: {
        markdownFilename,
        targetFolderId: args.targetFolderId ?? null,
        duplicatePolicy: 'import_copy' as const,
      },
      sourceMeta: {
        pageUrl: args.pageUrl,
        pageTitle: args.pageTitle,
      },
    }

    let started: Awaited<ReturnType<typeof articleBundleSessionStart>>
    try {
      started = await articleBundleSessionStart(startBody)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!/ARTICLE_BUNDLE_SESSION_LIMIT/i.test(msg)) throw e
      await new Promise((r) => setTimeout(r, 400))
      started = await articleBundleSessionStart(startBody)
    }

    sessionId = started.sessionId
    if (!sessionId?.startsWith('ab_')) {
      throw new Error('Markdown 会话创建失败（Pro 未返回有效 sessionId）')
    }

    for (let i = 0; i < args.files.length; i++) {
      if (args.shouldAbort?.()) {
        throw new Error('导出 Markdown 已取消')
      }

      const file = args.files[i]!
      const relativePath = file.relativePath.replace(/\\/g, '/').replace(/^\/+/, '')

      const fileDataUrl = await fileToBase64DataUrl(file)
      if (!dataUrlFitsDirectImport(fileDataUrl, MAX_DATA_URL_JSON_CHARS)) {
        throw new Error(
          `文件 ${relativePath} 过大，无法上传（请减少图片或缩短页面）`,
        )
      }

      await articleBundleSessionAppend({
        sessionId,
        relativePath,
        fileDataUrl,
      })
    }

    if (args.shouldAbort?.()) {
      throw new Error('导出 Markdown 已取消')
    }

    const finished = await articleBundleSessionFinish({
      sessionId,
      requiredFiles: {
        markdown: markdownFilename,
        thumbnail: ARTICLE_BUNDLE_THUMB_RELATIVE,
      },
    })

    const warnings = (finished.warnings ?? []).map((w) =>
      typeof w === 'string' ? w : w.message || w.code || String(w),
    )

    return {
      assetId: finished.assetId,
      warnings,
      tempDir: started.tempDir,
    }
  } catch (err) {
    if (sessionId) {
      await releaseArticleBundleSessionOnFailure(sessionId)
    }

    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('取消') || msg.includes('aborted')) {
      return { warnings: [], skipped: true }
    }
    throw new Error(formatArticleBundleApiError(err))
  }
}
