import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assignPlaceholderPaths,
  replaceMediaPaths,
  type MediaPathReplaceItem,
} from '../src/page-markdown/extract/media-path-replace.ts'

function imageItem(preview: string, extra?: string[]): MediaPathReplaceItem {
  const replaceUrls = [preview, ...(extra ?? [])]
  return {
    originalUrl: preview,
    replaceUrls,
    highResUrl: preview,
    tagName: 'IMG',
    type: 'image',
    extension: 'jpg',
  }
}

describe('replaceMediaPaths', () => {
  it('maps each distinct URL to its own assets path (pc528-style)', () => {
    const u1 = 'https://img.pc520.net/wp-content/uploads/2025/11/a.jpg'
    const u2 = 'https://img.pc520.net/wp-content/uploads/2025/11/b.jpg'
    const u3 = 'https://img.pc520.net/wp-content/uploads/2025/10/c.jpg'
    const media: MediaPathReplaceItem[] = [
      imageItem(u1, [`${u1.replace('.jpg', '-300x200.jpg')}`]),
      imageItem(u2),
      imageItem(u3),
    ]
    assignPlaceholderPaths(media)
    const md = [`![one](${u1})`, `![two](${u2})`, `![three](${u3})`].join('\n')
    const ok = new Set(media.map((m) => m.originalUrl))
    const out = replaceMediaPaths(md, media, ok)
    assert.match(out, /!\[one\]\(\.\/assets\/img-001\.jpg\)/)
    assert.match(out, /!\[two\]\(\.\/assets\/img-002\.jpg\)/)
    assert.match(out, /!\[three\]\(\.\/assets\/img-003\.jpg\)/)
    assert.doesNotMatch(out, /img-001\.jpg\).*img-001\.jpg/)
  })

  it('does not let one row steal URLs already claimed by another', () => {
    const shared = 'https://cdn.example.com/shared-thumb.jpg'
    const full = 'https://cdn.example.com/photo-a.jpg'
    const b = 'https://cdn.example.com/photo-b.jpg'
    const media: MediaPathReplaceItem[] = [imageItem(full, [shared]), imageItem(b, [shared])]
    assignPlaceholderPaths(media)
    const md = `![a](${full})\n![b](${b})`
    const ok = new Set([full, b])
    const out = replaceMediaPaths(md, media, ok)
    assert.match(out, /!\[a\]\(\.\/assets\/img-001\.jpg\)/)
    assert.match(out, /!\[b\]\(\.\/assets\/img-002\.jpg\)/)
  })
})
