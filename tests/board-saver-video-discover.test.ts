import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveVideoPageContext } from '../src/shared/video-page-url-rules.ts'

function videoPageItemsFromHrefs(
  hrefs: string[],
  opts: {
    seenUrls: Set<string>
    totalItems: number
    maxItems: number
    nextId: () => string
  },
): { newItems: Array<{ kind: string; url: string; platform?: string }>; totalItems: number } {
  let totalItems = opts.totalItems
  const newItems: Array<{ kind: string; url: string; platform?: string }> = []
  for (const raw of hrefs) {
    if (totalItems >= opts.maxItems) break
    const ctx = resolveVideoPageContext(raw)
    if (!ctx) continue
    if (opts.seenUrls.has(ctx.url)) continue
    opts.seenUrls.add(ctx.url)
    totalItems++
    newItems.push({ kind: 'video_page', url: ctx.url, platform: ctx.platform })
  }
  return { newItems, totalItems }
}

describe('videoPageItemsFromHrefs', () => {
  it('dedupes canonical video URLs and assigns video_page kind', () => {
    const seenUrls = new Set<string>()
    let n = 0
    const { newItems, totalItems } = videoPageItemsFromHrefs(
      [
        'https://www.bilibili.com/video/BV1xx411c7mD?p=1',
        'https://www.bilibili.com/video/BV1xx411c7mD',
        'https://www.youtube.com/feed/trending',
      ],
      {
        pageTitle: 'Test',
        seenUrls,
        totalItems: 0,
        maxItems: 100,
        nextId: () => `id-${++n}`,
      },
    )
    assert.equal(newItems.length, 1)
    assert.equal(totalItems, 1)
    assert.equal(newItems[0].kind, 'video_page')
    assert.equal(newItems[0].platform, 'bilibili')
    assert.equal(newItems[0].url, 'https://www.bilibili.com/video/BV1xx411c7mD')
  })
})
