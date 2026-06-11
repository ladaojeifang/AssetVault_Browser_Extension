import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  canonicalImagePath,
  collectContentHtmlImagePaths,
  isUrlInMainColumn
} from '../../src/page-markdown/extract/main-column-url-match.ts'

describe('main column URL match edge cases', () => {
  it('canonicalImagePath ignores query and hash', () => {
    const a = canonicalImagePath('https://mmbiz.qpic.cn/mmbiz_jpg/foo/1?wx_fmt=jpeg')
    const b = canonicalImagePath('https://mmbiz.qpic.cn/mmbiz_jpg/foo/1#frag')
    assert.equal(a, b)
    assert.equal(a, 'mmbiz.qpic.cn/mmbiz_jpg/foo/1')
  })

  it('collectContentHtmlImagePaths finds lazy attributes and wechat hosts', () => {
    const html = `
      <img data-src="https://mmbiz.qpic.cn/mmbiz_png/a/b.png" />
      <img src="https://wx.qlogo.cn/mmhead/zz/0" />
    `
    const paths = collectContentHtmlImagePaths(html)
    assert.equal(paths.size >= 2, true)
    assert.equal([...paths].some((p) => p.includes('mmbiz.qpic.cn')), true)
  })

  it('isUrlInMainColumn matches by canonical path when query strings differ', () => {
    const base = 'https://mmbiz.qpic.cn/mmbiz_jpg/article/1'
    const withQuery = `${base}?wx_fmt=jpeg&tp=webp`
    const html = `<img src="${base}" />`
    const dom = new Set([base])
    assert.equal(isUrlInMainColumn(withQuery, html, dom), true)
  })

  it('rejects sidebar URLs not present in DOM or purified HTML', () => {
    const main = 'https://example.com/wp-content/uploads/hero.jpg'
    const sidebar = 'https://ads.example.com/banner.jpg'
    const html = `<article><img src="${main}" /></article>`
    const dom = new Set([main])
    assert.equal(isUrlInMainColumn(main, html, dom), true)
    assert.equal(isUrlInMainColumn(sidebar, html, dom), false)
  })

  it('matches URL embedded only in purified HTML string', () => {
    const url = 'https://cdn.site.com/path/inline.png'
    const html = `<p>See also ${url} in text</p>`
    const dom = new Set<string>()
    assert.equal(isUrlInMainColumn(url, html, dom), true)
  })
})
