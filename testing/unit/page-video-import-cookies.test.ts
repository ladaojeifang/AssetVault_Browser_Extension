import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cookieDomainMatchesPage,
  detectPageVideoCookiesBrowser,
  formatCookieHeader,
  hasPlatformLoginCookies,
  mergeCookiesByName,
  registrableCookieDomain,
  cookieLookupUrls,
  resolvePageVideoCookieFields,
  readPageVideoCookiePairs,
  PLATFORM_COOKIE_STRATEGIES
} from '../../src/shared/page-video-import-cookie-strategies.ts'

test('detectPageVideoCookiesBrowser maps user agent to edge/chrome/firefox', () => {
  assert.equal(
    detectPageVideoCookiesBrowser(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0'
    ),
    'edge'
  )
  assert.equal(
    detectPageVideoCookiesBrowser(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    ),
    'chrome'
  )
  assert.equal(detectPageVideoCookiesBrowser('Mozilla/5.0 Firefox/115.0'), 'firefox')
})

test('formatCookieHeader joins name=value pairs without Cookie prefix', () => {
  assert.equal(
    formatCookieHeader([
      { name: 'SESSDATA', value: 'abc' },
      { name: 'bili_jct', value: 'xyz' }
    ]),
    'SESSDATA=abc; bili_jct=xyz'
  )
  assert.equal(formatCookieHeader([]), undefined)
})

test('hasPlatformLoginCookies detects bilibili session', () => {
  assert.equal(
    hasPlatformLoginCookies('bilibili', [{ name: 'SESSDATA', value: 'x' }]),
    true
  )
  assert.equal(
    hasPlatformLoginCookies('bilibili', [
      { name: 'DedeUserID', value: '1' },
      { name: 'bili_jct', value: 't' }
    ]),
    true
  )
  assert.equal(hasPlatformLoginCookies('bilibili', [{ name: 'buvid3', value: 'g' }]), false)
})

test('registrableCookieDomain and cookieLookupUrls cover generic and platform-specific urls', () => {
  assert.equal(registrableCookieDomain('www.bilibili.com'), 'bilibili.com')
  const generic = cookieLookupUrls('https://www.bilibili.com/video/BV1')
  assert.ok(generic.includes('https://www.bilibili.com/video/BV1'))
  assert.ok(generic.includes('https://www.bilibili.com/'))
  assert.ok(generic.includes('https://account.bilibili.com/'))
  assert.ok(!generic.includes('https://data.bilibili.com/'))

  const bilibili = cookieLookupUrls(
    'https://www.bilibili.com/video/BV1',
    PLATFORM_COOKIE_STRATEGIES.bilibili
  )
  assert.ok(bilibili.includes('https://data.bilibili.com/'))
})

test('resolvePageVideoCookieFields passes through popup cookieHeader', async () => {
  const fields = await resolvePageVideoCookieFields({
    cookieUrls: ['https://www.bilibili.com/video/BV1'],
    cookieHeader: 'SESSDATA=from_popup; bili_jct=t'
  })
  assert.equal(fields.cookiesFromBrowser, 'none')
  assert.equal(fields.cookieHeader, 'SESSDATA=from_popup; bili_jct=t')
})

test('resolvePageVideoCookieFields always sets cookiesFromBrowser none', async () => {
  const withHeader = await resolvePageVideoCookieFields({
    cookieUrls: ['https://www.bilibili.com/video/BV1'],
    getCookies: async () => [{ name: 'SESSDATA', value: 's1' }]
  })
  assert.equal(withHeader.cookiesFromBrowser, 'none')
  assert.equal(withHeader.cookieHeader, 'SESSDATA=s1')

  const empty = await resolvePageVideoCookieFields({
    cookieUrls: ['https://example.com/v'],
    getCookies: async () => []
  })
  assert.equal(empty.cookiesFromBrowser, 'none')
  assert.equal(empty.cookieHeader, undefined)
})

test('readPageVideoCookiePairs merges cookies from multiple page urls', async () => {
  const pairs = await readPageVideoCookiePairs({
    cookieUrls: ['https://www.bilibili.com/feed', 'https://www.bilibili.com/video/BV1'],
    getCookies: async (url) =>
      url.includes('/video/')
        ? [{ name: 'SESSDATA', value: 's1' }]
        : [{ name: 'bili_jct', value: 't1' }]
  })
  assert.equal(pairs.length, 2)
  assert.ok(pairs.some((c) => c.name === 'SESSDATA'))
})

test('cookieDomainMatchesPage matches registrable domain cookies', () => {
  assert.equal(
    cookieDomainMatchesPage('.bilibili.com', 'https://www.bilibili.com/video/BV1'),
    true
  )
  assert.equal(cookieDomainMatchesPage('bilibili.com', 'https://www.bilibili.com/'), true)
  assert.equal(cookieDomainMatchesPage('.google.com', 'https://www.bilibili.com/video/BV1'), false)
})

test('mergeCookiesByName keeps last duplicate name', () => {
  assert.deepEqual(
    mergeCookiesByName([
      [{ name: 'SESSDATA', value: 'old' }],
      [{ name: 'SESSDATA', value: 'new' }, { name: 'bili_jct', value: 't' }]
    ]),
    [
      { name: 'SESSDATA', value: 'new' },
      { name: 'bili_jct', value: 't' }
    ]
  )
})
