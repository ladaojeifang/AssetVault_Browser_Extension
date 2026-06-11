import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizePageVideoJob } from '../../src/shared/page-video-import-errors.ts'
import type { PageVideoJob } from '../../src/shared/page-video-import-types.ts'

function job(partial: Partial<PageVideoJob> & Pick<PageVideoJob, 'status'>): PageVideoJob {
  return {
    jobId: 'j',
    url: 'https://example.com/v',
    ...partial
  }
}

test('summarizePageVideoJob describes completed import', () => {
  assert.equal(
    summarizePageVideoJob(
      job({ status: 'completed', assetId: 'a1', output: { filename: 'clip.mp4' } })
    ),
    '已保存：clip.mp4（j）'
  )
})

test('summarizePageVideoJob describes skipped duplicate', () => {
  assert.equal(
    summarizePageVideoJob(
      job({ status: 'completed', skipped: true, existingAssetId: 'old' })
    ),
    '已跳过（库中已有相同作品）'
  )
})

test('summarizePageVideoJob maps failed job error code', () => {
  assert.match(
    summarizePageVideoJob(
      job({
        status: 'failed',
        error: { code: 'YTDLP_AUTH_REQUIRED', message: 'raw' }
      })
    ),
    /需要登录/
  )
})

test('summarizePageVideoJob handles cancelled', () => {
  assert.equal(summarizePageVideoJob(job({ status: 'cancelled' })), '已取消')
})
