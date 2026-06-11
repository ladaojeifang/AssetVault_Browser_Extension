import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  parseWechatPicturePageInfoFromText,
  supplementHtmlWithWechatImages,
} from '../../src/page-markdown/extract/wechat-page-data.ts'

const SAMPLE = `
picture_page_info_list: [
  {
    cdn_url: 'https://mmbiz.qpic.cn/sz_mmbiz_png/ic1sbuVQxSUkbeZmia8flQ5OiaMHtoE7r8UpdkdJicb80vH400p1xDmt0Hj6FllA5IBeickg0CM7z7ic8xHP0JxfHcqfSSuNgicH8lawHnHPDWCrZs/0?wx_fmt=png',
    width: '1023' * 1,
    height: '1537' * 1,
  },
  {
    cdn_url: 'http://mmbiz.qpic.cn/sz_mmbiz_png/ic1sbuVQxSUk9XXfsSpCO9c83e4piaPcEIw2YHIia0av3dhvaDpxsTG1RpbiaG6kNUDj7xcpactsgRL3YbmOeAxILGafl8muqzUCYahViaUdbLxI/0?wx_fmt=png',
    width: '0' * 1,
    height: '0' * 1,
  },
  {
    cdn_url: 'https://mmbiz.qpic.cn/mmbiz_png/ic1sbuVQxSUkfsH18PZ7VVAr7z356CQOrTNzKIagD29NATF9M1amubTMbibk2M7FIPkxiaXhNqCmNxc63x41kiboAoatT2EianGVNPmh4qtKEaSw/0?wx_fmt=png',
    width: '941' * 1,
    height: '1411' * 1,
  },
]
`

describe('parseWechatPicturePageInfoFromText', () => {
  it('reads large article photos from picture_page_info_list', () => {
    const all = parseWechatPicturePageInfoFromText(SAMPLE)
    const large = all.filter((p) => p.width >= 400)
    assert.equal(large.length, 2)
    assert.ok(large[0]?.url.includes('mmbiz.qpic.cn'))
  })
})

describe('supplementHtmlWithWechatImages', () => {
  it('appends missing img tags for markdown', () => {
    const url = 'https://mmbiz.qpic.cn/mmbiz_png/test/0?wx_fmt=png'
    const out = supplementHtmlWithWechatImages('<p>hi</p>', [
      { url, width: 941, height: 1411 },
    ])
    assert.ok(out.includes(url))
    assert.ok(out.includes('<img'))
  })
})
