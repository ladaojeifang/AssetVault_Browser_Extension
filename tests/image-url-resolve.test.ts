import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  imageUrlQualityScore,
  isOffArticleCdnImage,
  pickBestImageUrl,
} from '../src/shared/image-url-quality.ts'

const FULL =
  'https://img.pc520.net/wp-content/uploads/2025/11/2025113023041349.jpg'
const THUMB =
  'https://img.pc520.net/wp-content/uploads/2025/11/2025113023041349-300x200.jpg'
const LAZY =
  'https://img.pc520.net/wp-content/uploads/2025/10/2025101615151362.jpg'

describe('imageUrlQualityScore', () => {
  it('prefers full wp uploads over -300x200 thumbnail', () => {
    assert.ok(imageUrlQualityScore(FULL) > imageUrlQualityScore(THUMB))
  })
})

describe('isOffArticleCdnImage', () => {
  it('drops pc528.net branding hosts on pc528 pages', () => {
    assert.equal(
      isOffArticleCdnImage('https://www.pc528.net/static/watermark.jpg', 'https://www.pc528.net/x'),
      true,
    )
    assert.equal(
      isOffArticleCdnImage(
        'https://img.pc520.net/wp-content/uploads/2025/11/a.jpg',
        'https://www.pc528.net/x',
      ),
      false,
    )
  })
})

describe('pickBestImageUrl (pc528)', () => {
  it('prefers anchor full jpeg over img thumbnail src', () => {
    assert.equal(
      pickBestImageUrl([THUMB, FULL], 'https://www.pc528.net/article'),
      FULL,
    )
  })

  it('prefers data-src full image over lazy gif placeholder path', () => {
    assert.equal(pickBestImageUrl([LAZY], 'https://www.pc528.net/article'), LAZY)
  })

  it('rejects noise tracking URLs when a real candidate exists', () => {
    const noise = 'https://www.google-analytics.com/collect?pixel=1x1.gif'
    assert.equal(pickBestImageUrl([noise, FULL], 'https://www.pc528.net/article'), FULL)
  })
})
