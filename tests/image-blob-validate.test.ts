import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isAcceptableArticleImageBlob } from '../src/page-markdown/image-blob-validate.ts'

describe('isAcceptableArticleImageBlob', () => {
  it('rejects tiny blobs', async () => {
    assert.equal(
      await isAcceptableArticleImageBlob(new Blob([new Uint8Array(100)], { type: 'image/jpeg' })),
      false,
    )
  })

  it('rejects text/html masquerading as image', async () => {
    assert.equal(
      await isAcceptableArticleImageBlob(new Blob(['<html></html>'], { type: 'text/html' })),
      false,
    )
  })
})
