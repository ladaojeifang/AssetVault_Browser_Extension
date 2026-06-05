import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseWechatPicturePageInfoFromText } from '../src/page-markdown/extract/wechat-page-data.ts'

/** pc528 entry-content fragment: images use src + fancybox anchor */
const PC528_SNIPPET = `
<div class="entry-content">
<p>intro</p>
<p><a href="https://img.pc520.net/wp-content/uploads/2025/11/2025113023041349.jpg" data-fancybox="gallery">
<img alt="caption" src="https://img.pc520.net/wp-content/uploads/2025/11/2025113023041349-300x200.jpg" class="wp-image-12758" />
</a></p>
<p><img data-src="https://img.pc520.net/wp-content/uploads/2025/10/2025101615151362.jpg" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" /></p>
</div>
`

describe('pc528-style entry-content images', () => {
  it('has multiple wp-content image URLs in HTML', () => {
    const urls = [
      ...PC528_SNIPPET.matchAll(/https:\/\/img\.pc520\.net\/wp-content\/uploads\/[^"'\s<>]+/g),
    ].map((m) => m[0])
    assert.ok(urls.length >= 2)
  })

})

describe('wechat regression', () => {
  it('still parses picture_page_info_list', () => {
    const large = parseWechatPicturePageInfoFromText(
      "cdn_url: 'https://mmbiz.qpic.cn/x/0?wx_fmt=png', width: '900' * 1, height: '1200' * 1,",
    ).filter((p) => p.width >= 400)
    assert.equal(large.length, 1)
  })
})
