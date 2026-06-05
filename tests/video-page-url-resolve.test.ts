import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveVideoPageContext } from '../src/shared/video-page-url-rules.ts'

function isTikTokVmShortUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim())
    return u.hostname === 'vm.tiktok.com' && u.pathname.length > 1
  } catch {
    return false
  }
}

async function resolveVideoPageContextAsync(raw: string) {
  const direct = resolveVideoPageContext(raw)
  if (direct) return direct
  if (!isTikTokVmShortUrl(raw)) return null
  try {
    const res = await fetch(raw.trim(), { method: 'GET', redirect: 'follow', credentials: 'omit' })
    const finalUrl = res.url || null
    if (!finalUrl) return null
    return resolveVideoPageContext(finalUrl)
  } catch {
    return null
  }
}

describe('isTikTokVmShortUrl', () => {
  it('detects vm.tiktok.com paths', () => {
    assert.equal(isTikTokVmShortUrl('https://vm.tiktok.com/ZMabc123/'), true)
    assert.equal(isTikTokVmShortUrl('https://www.tiktok.com/@u/video/1'), false)
  })
})

describe('resolveVideoPageContextAsync', () => {
  it('returns sync result without fetch for standard URLs', async () => {
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    const ctx = await resolveVideoPageContextAsync(url)
    assert.deepEqual(ctx, resolveVideoPageContext(url))
  })

  it('follows vm.tiktok.com redirect then canonicalizes', async (t) => {
    const original = globalThis.fetch
    t.after(() => {
      globalThis.fetch = original
    })
    globalThis.fetch = async () =>
      ({
        url: 'https://www.tiktok.com/@user/video/1234567890123456789'
      }) as Response

    const ctx = await resolveVideoPageContextAsync('https://vm.tiktok.com/ZMshort/')
    assert.equal(ctx?.platform, 'tiktok')
    assert.equal(ctx?.url, 'https://www.tiktok.com/@user/video/1234567890123456789')
  })

  it('returns null when vm redirect fails', async (t) => {
    const original = globalThis.fetch
    t.after(() => {
      globalThis.fetch = original
    })
    globalThis.fetch = async () => {
      throw new Error('network')
    }
    assert.equal(await resolveVideoPageContextAsync('https://vm.tiktok.com/ZMbad/'), null)
  })
})
