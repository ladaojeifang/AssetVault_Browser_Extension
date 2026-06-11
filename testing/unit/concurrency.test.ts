import assert from 'node:assert/strict'
import test from 'node:test'
import { ConcurrencyQueue } from '../../src/shared/concurrency.ts'

test('ConcurrencyQueue limits parallel execution', async () => {
  const q = new ConcurrencyQueue(2)
  let active = 0
  let maxActive = 0
  const tasks = Array.from({ length: 5 }, (_, i) =>
    q.add(async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise((r) => setTimeout(r, 15))
      active--
      return i
    }),
  )
  const results = await Promise.all(tasks)
  assert.equal(results.length, 5)
  assert.ok(maxActive <= 2, `expected max 2 concurrent, got ${maxActive}`)
})

test('ConcurrencyQueue rejects invalid concurrency', () => {
  assert.throws(
    () => new ConcurrencyQueue({ concurrency: 4 } as unknown as number),
    TypeError,
  )
})
