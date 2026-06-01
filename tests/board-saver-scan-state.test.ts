import assert from 'node:assert/strict'
import test from 'node:test'
import { resolvePostImportAction } from '../src/board-saver/board-saver-scan-state.ts'

test('waterfall resumes periodic', () => {
  assert.deepEqual(
    resolvePostImportAction({
      pageType: 'waterfall',
      scrollComplete: false,
      hadPeriodicTimer: false,
    }),
    { type: 'resume-periodic' },
  )
})

test('lazy incomplete resumes scroll', () => {
  assert.deepEqual(
    resolvePostImportAction({
      pageType: 'lazy',
      scrollComplete: false,
      hadPeriodicTimer: false,
    }),
    { type: 'resume-lazy-scroll' },
  )
})

test('static returns idle', () => {
  assert.deepEqual(
    resolvePostImportAction({
      pageType: 'static',
      scrollComplete: true,
      hadPeriodicTimer: false,
    }),
    { type: 'idle' },
  )
})

test('had periodic timer resumes periodic even on static', () => {
  assert.deepEqual(
    resolvePostImportAction({
      pageType: 'static',
      scrollComplete: true,
      hadPeriodicTimer: true,
    }),
    { type: 'resume-periodic' },
  )
})
