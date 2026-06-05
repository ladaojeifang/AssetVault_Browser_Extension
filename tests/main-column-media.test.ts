import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isUrlInMainColumn } from '../src/page-markdown/extract/main-column-url-match.ts'

describe('isUrlInMainColumn', () => {
  it('matches DOM set and purified HTML', () => {
    const inArticle = 'https://mmbiz.qpic.cn/mmbiz_jpg/article/1'
    const sidebar = 'https://mmbiz.qpic.cn/mmbiz_jpg/sidebar/2'
    const html = `<img src="${inArticle}" />`
    const dom = new Set([inArticle])

    assert.equal(isUrlInMainColumn(inArticle, html, dom), true)
    assert.equal(isUrlInMainColumn(sidebar, html, dom), false)
  })
})

describe('main column filter', () => {
  it('drops URLs outside main column', () => {
    const main = 'https://example.com/a.jpg'
    const side = 'https://example.com/side.jpg'
    const html = `<p><img src="${main}" /></p>`
    const dom = new Set([main])
    assert.equal(isUrlInMainColumn(main, html, dom), true)
    assert.equal(isUrlInMainColumn(side, html, dom), false)
  })
})
