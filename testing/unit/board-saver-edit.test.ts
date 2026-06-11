import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { applyFilenameAffixes } from '../../src/board-saver/board-saver-edit.ts'

describe('applyFilenameAffixes', () => {
  it('adds prefix and suffix while preserving extension', () => {
    assert.equal(applyFilenameAffixes('photo.jpg', 'pre-', '-post'), 'pre-photo-post.jpg')
  })

  it('handles names without extension', () => {
    assert.equal(applyFilenameAffixes('untitled', 'a', 'b'), 'auntitledb')
  })
})
