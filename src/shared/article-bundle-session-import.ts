import {
  articleBundleSessionStart,
  articleBundleSessionAppend,
  articleBundleSessionFinish,
  releaseArticleBundleSessionOnFailure
} from './article-bundle-session-api'
import { blobToDataUrl } from './data-url-import'

export interface ArticleBundleFile {
  relativePath: string
  blob: Blob
}

export interface ArticleBundleSessionImportArgs {
  pageUrl: string
  pageTitle: string
  markdownFilename: string
  targetFolderId?: string | null
  
  files: ArticleBundleFile[] // markdown, thumb, images, etc.
  
  shouldAbort?: () => boolean
}

export interface ArticleBundleSessionImportResult {
  assetId?: string
  warnings: string[]
  skipped?: boolean
  tempDir?: string
}

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024 // 50MB max per file upload for now

export async function importArticleBundleViaSession(
  args: ArticleBundleSessionImportArgs
): Promise<ArticleBundleSessionImportResult> {
  let sessionId: string | null = null

  try {
    const startBody = {
      output: {
        markdownFilename: args.markdownFilename,
        targetFolderId: args.targetFolderId ?? null,
        duplicatePolicy: 'import_copy' as const
      },
      sourceMeta: {
        pageUrl: args.pageUrl,
        pageTitle: args.pageTitle
      }
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

    for (let i = 0; i < args.files.length; i++) {
      if (args.shouldAbort?.()) {
        throw new Error('导出 Markdown 已取消')
      }

      const file = args.files[i]!
      
      if (file.blob.size > MAX_FILE_SIZE_BYTES) {
        throw new Error(`文件 ${file.relativePath} 超过上传上限（${Math.round(file.blob.size / 1024 / 1024)}MB）`)
      }

      const fileDataUrl = await blobToDataUrl(file.blob)

      await articleBundleSessionAppend({
        sessionId: started.sessionId,
        relativePath: file.relativePath,
        fileDataUrl
      })
    }

    if (args.shouldAbort?.()) {
      throw new Error('导出 Markdown 已取消')
    }

    const finished = await articleBundleSessionFinish({
      sessionId: started.sessionId,
      options: {
        deleteSessionFilesAfter: true // Cleanup temp dir after import by default
      }
    })

    return {
      assetId: finished.assetId,
      warnings: finished.warnings || [],
      tempDir: started.tempDir
    }
  } catch (err) {
    if (sessionId) {
      await releaseArticleBundleSessionOnFailure(sessionId)
    }
    
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('取消') || msg.includes('aborted')) {
      return { warnings: [], skipped: true }
    }
    throw err
  }
}
