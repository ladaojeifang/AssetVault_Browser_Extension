import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isVideoPageUrl, resolveVideoPageContext } from '../src/shared/video-page-url-rules.ts'

describe('resolveVideoPageContext', () => {
  it('canonicalizes YouTube watch URL', () => {
    const ctx = resolveVideoPageContext(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&utm_source=x'
    )
    assert.equal(ctx?.platform, 'youtube')
    assert.equal(ctx?.url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  })

  it('canonicalizes youtu.be short link', () => {
    const ctx = resolveVideoPageContext('https://youtu.be/dQw4w9WgXcQ')
    assert.equal(ctx?.url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  })

  it('canonicalizes Bilibili BV URL', () => {
    const ctx = resolveVideoPageContext('https://www.bilibili.com/video/BV1xx411c7mD?p=1')
    assert.equal(ctx?.platform, 'bilibili')
    assert.equal(ctx?.url, 'https://www.bilibili.com/video/BV1xx411c7mD')
  })

  it('canonicalizes Douyin video path', () => {
    const ctx = resolveVideoPageContext('https://www.douyin.com/video/7123456789012345678')
    assert.equal(ctx?.platform, 'douyin')
    assert.ok(ctx?.url.includes('/video/7123456789012345678'))
  })

  it('rejects generic article pages', () => {
    assert.equal(isVideoPageUrl('https://example.com/blog/post'), false)
    assert.equal(resolveVideoPageContext('https://www.youtube.com/feed/trending'), null)
  })

  it('canonicalizes X status URL', () => {
    const ctx = resolveVideoPageContext('https://twitter.com/user/status/1234567890')
    assert.equal(ctx?.platform, 'twitter')
    assert.equal(ctx?.url, 'https://x.com/i/status/1234567890')
  })

  it('canonicalizes YouTube Shorts to watch URL', () => {
    const ctx = resolveVideoPageContext('https://www.youtube.com/shorts/AbCdEf12-_3')
    assert.equal(ctx?.platform, 'youtube')
    assert.equal(ctx?.url, 'https://www.youtube.com/watch?v=AbCdEf12-_3')
  })

  it('canonicalizes TikTok video path without tracking query', () => {
    const ctx = resolveVideoPageContext(
      'https://www.tiktok.com/@user/video/1234567890123456789?utm_source=share'
    )
    assert.equal(ctx?.platform, 'tiktok')
    assert.equal(ctx?.url, 'https://www.tiktok.com/@user/video/1234567890123456789')
  })

  it('does not treat vm.tiktok.com short links as canonical (use async resolve)', () => {
    assert.equal(resolveVideoPageContext('https://vm.tiktok.com/ZMabc123/'), null)
  })

  it('canonicalizes Instagram reel', () => {
    const ctx = resolveVideoPageContext('https://www.instagram.com/reel/ABC123xyz/')
    assert.equal(ctx?.platform, 'instagram')
    assert.equal(ctx?.url, 'https://www.instagram.com/reel/ABC123xyz/')
  })

  it('canonicalizes Vimeo numeric id', () => {
    const ctx = resolveVideoPageContext('https://vimeo.com/987654321?share=copy')
    assert.equal(ctx?.platform, 'vimeo')
    assert.equal(ctx?.url, 'https://vimeo.com/987654321')
  })

  it('canonicalizes Kuaishou short-video', () => {
    const ctx = resolveVideoPageContext('https://www.kuaishou.com/short-video/3xabc123')
    assert.equal(ctx?.platform, 'kuaishou')
    assert.equal(ctx?.url, 'https://www.kuaishou.com/short-video/3xabc123')
  })

  it('canonicalizes Xiaohongshu explore note', () => {
    const ctx = resolveVideoPageContext('https://www.xiaohongshu.com/explore/abcdef0123456789')
    assert.equal(ctx?.platform, 'xiaohongshu')
    assert.equal(ctx?.url, 'https://www.xiaohongshu.com/explore/abcdef0123456789')
  })

  it('rejects non-http schemes', () => {
    assert.equal(resolveVideoPageContext('javascript:alert(1)'), null)
    assert.equal(resolveVideoPageContext('file:///local/video.mp4'), null)
  })
})
