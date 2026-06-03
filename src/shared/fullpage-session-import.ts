import {

  fullPageSessionAppend,

  fullPageSessionFinish,

  fullPageSessionStart,

  releaseFullPageSessionOnFailure

} from './fullpage-session-api'

import {

  FULLPAGE_KEEP_STRIP_FILES_AFTER_FINISH,

  FULLPAGE_STRIP_JPEG_QUALITY,

  fullPageInspectSessionId

} from './fullpage-session-paths'

import type { FullPageSessionImportResult } from './fullpage-session-types'

import { estimateJpegBlobUpperBound } from './fullpage-capture'
import { FULLPAGE_STRIP_APPEND_MAX_BYTES } from './fullpage-session-limits'
import { blobToDataUrl, canvasToStripBlob } from './fullpage-strip-upload'



export { mapFullPageFinishWarnings } from './fullpage-session-paths'



function formatFullPageApiError(e: unknown): string {

  const msg = e instanceof Error ? e.message : String(e)

  if (/FULLPAGE_SESSION_LIMIT/i.test(msg)) {

    return '桌面端活跃整页会话过多，请重启 AssetVault Pro 后重试'

  }

  if (/LIBRARY_NOT_OPEN|LIBRARY_NOT_READY/i.test(msg)) {

    return '资料库未打开，请先在 AssetVault Pro 中打开资料库'

  }

  if (/FULLPAGE_SESSION_NOT_FOUND|FULLPAGE_SESSION_EXPIRED/i.test(msg)) {

    return '整页截图会话不存在或已过期'

  }

  if (/FULLPAGE_STITCH|FULLPAGE_STRIP|FULLPAGE_DIMENSION/i.test(msg)) {

    return `桌面端拼接失败: ${msg}`

  }

  if (/HTTP 404|Not Found/i.test(msg)) {

    return 'AssetVault Pro 未提供整页截图 API，请更新桌面端'

  }

  if (/body too large|请求体过大|INVALID_REQUEST/i.test(msg)) {

    return '条带上传失败（请求体过大）：请更新 AssetVault Pro 后重试'

  }

  return msg

}



/**

 * start → append (stripDataUrl → library remote-imports/inspect-*) → finish.

 */

export async function importFullPageViaSession(args: {

  strips: OffscreenCanvas[]

  stripHeightsPx: number[]

  widthPx: number

  contentHeightPx: number

  overlapPx: number

  devicePixelRatio: number

  format: 'jpeg' | 'png'

  filenameBase: string

  inspectSessionId: string

  targetFolderId?: string

  pageUrl?: string

  pageTitle?: string

  allowPartial: boolean

  shouldAbort?: () => boolean

}): Promise<FullPageSessionImportResult> {

  const ext = args.format === 'png' ? '.png' : '.jpg'

  const filename = `${args.filenameBase}${ext}`

  let sessionId: string | null = null



  try {

    const startBody = {

      layout: {

        widthPx: args.widthPx,

        contentHeightPx: args.contentHeightPx,

        stripHeightsPx: args.stripHeightsPx,

        overlapPx: 0,

        devicePixelRatio: args.devicePixelRatio

      },

      output: {

        filename,

        format: args.format,

        quality: FULLPAGE_STRIP_JPEG_QUALITY,

        targetFolderId: args.targetFolderId ?? null,

        duplicatePolicy: 'import_copy' as const

      },

      sourceMeta: {

        pageUrl: args.pageUrl,

        pageTitle: args.pageTitle

      },

      options: {

        sessionId: args.inspectSessionId

      }

    }



    let started: Awaited<ReturnType<typeof fullPageSessionStart>>

    try {

      started = await fullPageSessionStart(startBody)

    } catch (e) {

      const msg = e instanceof Error ? e.message : String(e)

      if (!/FULLPAGE_SESSION_LIMIT/i.test(msg)) throw e

      await new Promise((r) => setTimeout(r, 400))

      started = await fullPageSessionStart(startBody)

    }

    sessionId = started.sessionId

    try {
      await chrome.storage.local.set({
        lastFullpageInspectDir: started.tempDir,
        lastFullpageInspectAt: Date.now(),
        lastFullpageSessionId: started.sessionId
      })
    } catch {
      /* ignore */
    }

    let stripIndex = 0

    for (let k = 0; k < args.strips.length; k++) {

      if (args.shouldAbort?.()) {
        throw new Error('整页截图已取消')
      }

      const stripCanvas = args.strips[k]!
      const stripW = Math.max(1, stripCanvas.width)
      const stripH = Math.max(1, stripCanvas.height)
      if (stripH <= 0) continue

      const estBytes = estimateJpegBlobUpperBound(stripW, stripH)
      if (estBytes > FULLPAGE_STRIP_APPEND_MAX_BYTES) {
        throw new Error(
          `条带 ${stripIndex} 预估过大（约 ${Math.round(estBytes / 1024 / 1024)}MB），请缩短页面`,
        )
      }

      if (stripW !== args.widthPx && Math.abs(stripW - args.widthPx) > 1) {
        throw new Error(`条带 ${stripIndex} 宽度 ${stripW}px 与会话 ${args.widthPx}px 不一致`)
      }

      const blob = await canvasToStripBlob(stripCanvas, args.format)
      if (blob.size > FULLPAGE_STRIP_APPEND_MAX_BYTES) {
        throw new Error(`条带 ${stripIndex} 超过上传上限（${Math.round(blob.size / 1024 / 1024)}MB）`)
      }

      const stripDataUrl = await blobToDataUrl(blob)

      await fullPageSessionAppend({

        sessionId: started.sessionId,

        stripIndex,

        stripDataUrl,

        stripHeightPx: stripH,

        stripWidthPx: stripW

      })

      stripIndex++

    }



    if (args.shouldAbort?.()) {
      throw new Error('整页截图已取消')
    }

    const finished = await fullPageSessionFinish({

      sessionId: started.sessionId,

      layout: {

        contentHeightPx: args.contentHeightPx,

        overlapPx: 0

      },

      options: {

        allowPartial: args.allowPartial,

        deleteSessionFilesAfter: !FULLPAGE_KEEP_STRIP_FILES_AFTER_FINISH

      }

    })

    sessionId = null

    return {

      ...finished,

      sessionId: started.sessionId,

      tempDir: finished.tempDir ?? started.tempDir,

      stripsPreserved: finished.stripsPreserved ?? FULLPAGE_KEEP_STRIP_FILES_AFTER_FINISH

    }

  } catch (e) {

    if (sessionId) {

      await releaseFullPageSessionOnFailure(sessionId).catch(() => null)

    }

    throw new Error(formatFullPageApiError(e))

  }

}


