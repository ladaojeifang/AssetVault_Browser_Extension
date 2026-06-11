import assert from 'node:assert/strict'
import test from 'node:test'
import {
  accumulateBatchResponse,
  createBatchImportAggregate,
  formatImportSummary,
  hasImportedAssets,
} from '../../src/board-saver/board-saver-import.ts'

test('accumulateBatchResponse merges imported, skipped, and errors', () => {
  const acc = createBatchImportAggregate()
  const ok = accumulateBatchResponse(
    {
      ok: true,
      batch: {
        imported: ['a1', 'a2'],
        skipped: [{ url: 'https://x/skip' }],
        errors: [{ url: 'https://x/err' }],
      },
    },
    acc,
  )
  assert.equal(ok, true)
  assert.equal(acc.imported, 2)
  assert.deepEqual(acc.skippedUrls, ['https://x/skip'])
  assert.deepEqual(acc.errorUrls, ['https://x/err'])
  assert.equal(formatImportSummary(acc), '完成！成功 2，跳过 1，失败 1')
})

test('accumulateBatchResponse returns false for failed response', () => {
  const acc = createBatchImportAggregate()
  assert.equal(accumulateBatchResponse({ ok: false, error: 'nope' }, acc), false)
  assert.equal(acc.imported, 0)
})

test('hasImportedAssets detects partial success', () => {
  assert.equal(hasImportedAssets({ imported: 0, skippedUrls: [], errorUrls: ['x'] }), false)
  assert.equal(hasImportedAssets({ imported: 1, skippedUrls: [], errorUrls: ['x'] }), true)
})
