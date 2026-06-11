import assert from 'node:assert/strict'
import test from 'node:test'
import type { PageVideoJob } from '../../src/shared/page-video-import-types.ts'
import {
  classifyPageVideoCapabilityProbeError,
  isPageVideoJobApiResponse,
  isPageVideoJobTerminal,
  pollPageVideoJobUntilDone,
  readPageVideoImportFeature
} from '../../src/shared/page-video-import-core.ts'

test('readPageVideoImportFeature reads array and object feature flags', () => {
  assert.equal(readPageVideoImportFeature({ features: ['pageVideoImport'] }), true)
  assert.equal(readPageVideoImportFeature({ features: ['other'] }), false)
  assert.equal(readPageVideoImportFeature({ features: { pageVideoImport: true } }), true)
  assert.equal(readPageVideoImportFeature({ features: { pageVideoImport: false } }), false)
  assert.equal(readPageVideoImportFeature({}), null)
})

test('classifyPageVideoCapabilityProbeError detects route vs 404', () => {
  assert.equal(classifyPageVideoCapabilityProbeError('JOB_NOT_FOUND: missing'), true)
  assert.equal(classifyPageVideoCapabilityProbeError('LIBRARY_NOT_READY: 资料库未初始化'), true)
  assert.equal(classifyPageVideoCapabilityProbeError('HTTP 404: Not Found'), false)
  assert.equal(classifyPageVideoCapabilityProbeError('请求超时: AssetVault Pro 可能未启动'), null)
})

test('readPageVideoImportFeature accepts limits.pageVideoImport', () => {
  assert.equal(readPageVideoImportFeature({ limits: { pageVideoImport: { maxBatchItems: 50 } } }), true)
})

test('isPageVideoJobApiResponse detects job-shaped GET body', () => {
  assert.equal(isPageVideoJobApiResponse({ jobId: 'pvi_x', status: 'failed' }), true)
  assert.equal(isPageVideoJobApiResponse({ ok: true }), false)
  assert.equal(isPageVideoJobApiResponse(null), false)
})

test('isPageVideoJobTerminal covers terminal statuses only', () => {
  assert.equal(isPageVideoJobTerminal('completed'), true)
  assert.equal(isPageVideoJobTerminal('failed'), true)
  assert.equal(isPageVideoJobTerminal('cancelled'), true)
  assert.equal(isPageVideoJobTerminal('running'), false)
  assert.equal(isPageVideoJobTerminal('queued'), false)
})

function job(partial: Partial<PageVideoJob> & Pick<PageVideoJob, 'status'>): PageVideoJob {
  return {
    jobId: 'job-1',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    ...partial
  }
}

test('pollPageVideoJobUntilDone returns immediately on terminal job', async () => {
  let polls = 0
  const result = await pollPageVideoJobUntilDone('job-1', {
    deps: {
      getJob: async () => {
        polls++
        return job({ status: 'completed', assetId: 'asset-1' })
      },
      cancel: async () => {
        throw new Error('cancel should not run')
      },
      sleep: async () => {
        throw new Error('sleep should not run')
      }
    }
  })
  assert.equal(result.status, 'completed')
  assert.equal(polls, 1)
})

test('pollPageVideoJobUntilDone polls until terminal then stops', async () => {
  let polls = 0
  const sleeps: number[] = []
  const result = await pollPageVideoJobUntilDone('job-1', {
    deps: {
      getJob: async () => {
        polls++
        if (polls === 1) return job({ status: 'running', pollAfterMs: 5 })
        return job({ status: 'completed', assetId: 'asset-2' })
      },
      cancel: async () => {},
      sleep: async (ms) => {
        sleeps.push(ms)
      }
    }
  })
  assert.equal(result.assetId, 'asset-2')
  assert.equal(polls, 2)
  assert.deepEqual(sleeps, [5])
})

test('pollPageVideoJobUntilDone aborts and cancels', async () => {
  const ac = new AbortController()
  ac.abort()
  let cancelled = false
  await assert.rejects(
    () =>
      pollPageVideoJobUntilDone('job-abort', {
        signal: ac.signal,
        deps: {
          getJob: async () => job({ status: 'running' }),
          cancel: async () => {
            cancelled = true
          },
          sleep: async () => {}
        }
      }),
    /JOB_CANCELLED/
  )
  assert.equal(cancelled, true)
})

test('pollPageVideoJobUntilDone times out and cancels', async () => {
  let cancelled = false
  const t0 = Date.now()
  await assert.rejects(
    () =>
      pollPageVideoJobUntilDone('job-1', {
        maxMs: 20,
        deps: {
          getJob: async () => job({ status: 'running', pollAfterMs: 1 }),
          cancel: async () => {
            cancelled = true
          },
          sleep: async () => {
            /* no real delay */
          }
        }
      }),
    /YTDLP_STALLED/
  )
  assert.ok(Date.now() - t0 < 500)
  assert.equal(cancelled, true)
})

test('pollPageVideoJobUntilDone invokes onProgress', async () => {
  const seen: string[] = []
  await pollPageVideoJobUntilDone('job-1', {
    onProgress: (j) => seen.push(j.status),
    deps: {
      getJob: async () => job({ status: 'failed', error: { code: 'X', message: 'y' } }),
      cancel: async () => {},
      sleep: async () => {}
    }
  })
  assert.deepEqual(seen, ['failed'])
})
