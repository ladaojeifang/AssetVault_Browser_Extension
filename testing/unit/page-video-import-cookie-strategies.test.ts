import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getPlatformCookieStrategy,
  hasPlatformLoginCookies,
  platformDisplayName,
  platformRequiresLoginCookies,
  shouldAttachPageVideoCookies,
  PLATFORM_COOKIE_STRATEGIES,
  cookieLookupUrls,
  cookiePairsToFields
} from '../../src/shared/page-video-import-cookie-strategies.ts'

test('getPlatformCookieStrategy returns null for generic platforms', () => {
  assert.equal(getPlatformCookieStrategy('youtube'), null)
  assert.equal(getPlatformCookieStrategy(undefined), null)
})

test('bilibili strategy adds data subdomain and login cookie names', () => {
  const strategy = PLATFORM_COOKIE_STRATEGIES.bilibili
  assert.ok(strategy)
  const urls = cookieLookupUrls('https://www.bilibili.com/video/BV1', strategy)
  assert.ok(urls.includes('https://data.bilibili.com/'))
  assert.ok(strategy.loginCookieNames?.includes('SESSDATA'))
})

test('hasPlatformLoginCookies delegates to platform strategy', () => {
  assert.equal(hasPlatformLoginCookies('bilibili', [{ name: 'SESSDATA', value: 'x' }]), true)
  assert.equal(hasPlatformLoginCookies('bilibili', [{ name: 'buvid3', value: 'g' }]), false)
  assert.equal(hasPlatformLoginCookies('youtube', [{ name: 'VISITOR_INFO1_LIVE', value: 'y' }]), true)
})

test('platformRequiresLoginCookies and platformDisplayName', () => {
  assert.equal(platformRequiresLoginCookies('bilibili'), true)
  assert.equal(platformRequiresLoginCookies('youtube'), false)
  assert.equal(platformDisplayName('bilibili'), 'B 站')
  assert.equal(platformDisplayName('youtube'), '当前站点')
})

test('shouldAttachPageVideoCookies only for login-required platforms', () => {
  assert.equal(shouldAttachPageVideoCookies('bilibili'), true)
  assert.equal(shouldAttachPageVideoCookies('youtube'), false)
})

test('cookiePairsToFields builds header and none browser', () => {
  assert.deepEqual(cookiePairsToFields([{ name: 'a', value: '1' }]), {
    cookiesFromBrowser: 'none',
    cookieHeader: 'a=1'
  })
  assert.deepEqual(cookiePairsToFields([]), { cookiesFromBrowser: 'none' })
})
