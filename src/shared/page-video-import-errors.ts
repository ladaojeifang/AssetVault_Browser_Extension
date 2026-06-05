/** Map Pro JSend `code` to short user-facing Chinese text. */

import type { PageVideoJob } from './page-video-import-types'



export function pageVideoErrorMessage(code: string, fallback?: string): string {

  const map: Record<string, string> = {

    PAGE_VIDEO_NOT_SUPPORTED: '当前链接不是支持的视频作品页',

    PRO_FEATURE_UNAVAILABLE: '请升级 AssetVault Pro 以使用作品页视频导入',

    PAGE_VIDEO_QUEUE_FULL: 'Pro 下载队列已满，请稍后再试',

    YTDLP_NOT_INSTALLED: 'Pro 未安装 yt-dlp，请在桌面端完成初始化',

    YTDLP_AUTH_REQUIRED:

      '需要登录：请在本页登录该视频网站后重试（扩展会把当前页 Cookie 传给 Pro）',

    YTDLP_COOKIE_COPY_FAILED:

      'Pro 无法读取本机浏览器 Cookie 库。请重载扩展后重试；扩展应传递 cookieHeader 而非 cookiesFromBrowser',

    YTDLP_EXTRACTOR_FAILED: '无法解析该视频，请更新 Pro 或稍后重试',

    YTDLP_FORMAT_UNAVAILABLE: '所选清晰度不可用，请在扩展设置改为「最佳」后重试',

    YTDLP_DOWNLOAD_FAILED: '视频下载失败（网络或站点限制）',

    YTDLP_POSTPROCESS_FAILED: '视频合并失败',

    YTDLP_STALLED: '下载超时无进度',

    IMPORT_FAILED: '下载完成但写入资料库失败',

    DISK_FULL: '磁盘空间不足',

    JOB_NOT_FOUND: '任务不存在或已过期',

    JOB_CANCELLED: '已取消',

    LIBRARY_NOT_OPEN: '请先在 AssetVault Pro 中打开资料库',

    INVALID_REQUEST: '请求无效',

    BATCH_TOO_LARGE: '批量条数超过上限',

    FORBIDDEN: '请求被拒绝（请通过扩展或本机工具调用）'

  }

  return map[code] ?? fallback ?? code

}



export function parseApiError(e: unknown): { code: string; message: string } {

  const raw = e instanceof Error ? e.message : String(e)

  const m = raw.match(/^([A-Z0-9_]+):\s*(.*)$/s)

  if (m) {

    return { code: m[1], message: pageVideoErrorMessage(m[1], m[2].trim() || m[1]) }

  }

  if (/无法|超时|fetch|Pro 可能未启动/i.test(raw)) {

    return { code: 'NETWORK', message: '无法连接 AssetVault Pro，请确认桌面端已启动并启用 Web API' }

  }

  return { code: 'UNKNOWN', message: raw }

}



export function formatPageVideoDiagnostics(job: PageVideoJob): string {

  const lines = [

    `jobId: ${job.jobId}`,

    `url: ${job.url}`,

    `status: ${job.status}`

  ]

  if (job.platform) lines.push(`platform: ${job.platform}`)

  if (job.error) {

    lines.push(`error.code: ${job.error.code}`)

    lines.push(`error.message: ${job.error.message}`)

    if (job.error.detail) lines.push(`error.detail:\n${job.error.detail}`)

  }

  return lines.join('\n')

}



export function summarizePageVideoJob(job: PageVideoJob): string {

  if (job.status === 'completed') {

    if (job.skipped && job.existingAssetId) {

      return '已跳过（库中已有相同作品）'

    }

    if (job.assetId) {

      const name = job.output?.filename ?? '视频'

      return `已保存：${name}（${job.jobId.slice(-6)}）`

    }

    return `导入完成（${job.jobId.slice(-6)}）`

  }

  if (job.status === 'failed' && job.error) {

    const base = pageVideoErrorMessage(job.error.code, job.error.message)

    return `${base}（${job.jobId.slice(-6)}）`

  }

  if (job.status === 'cancelled') {

    return '已取消'

  }

  return '导入结束'

}


