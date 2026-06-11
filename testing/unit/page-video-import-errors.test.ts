import assert from 'node:assert/strict'
import test from 'node:test'
import {
  pageVideoErrorMessage,
  parseApiError
} from '../../src/shared/page-video-import-errors.ts'

test('pageVideoErrorMessage maps known Pro codes to Chinese', () => {
  assert.equal(
    pageVideoErrorMessage('YTDLP_AUTH_REQUIRED'),
    '需要登录：请在本页登录该视频网站后重试（扩展会把当前页 Cookie 传给 Pro）'
  )
  assert.equal(
    pageVideoErrorMessage('PRO_FEATURE_UNAVAILABLE'),
    '请升级 AssetVault Pro 以使用作品页视频导入'
  )
})

test('pageVideoErrorMessage uses fallback for unknown codes', () => {
  assert.equal(pageVideoErrorMessage('CUSTOM', '自定义说明'), '自定义说明')
  assert.equal(pageVideoErrorMessage('CUSTOM'), 'CUSTOM')
})

test('parseApiError extracts CODE: message from Error', () => {
  const parsed = parseApiError(new Error('YTDLP_DOWNLOAD_FAILED: upstream refused'))
  assert.equal(parsed.code, 'YTDLP_DOWNLOAD_FAILED')
  assert.equal(parsed.message, '视频下载失败（网络或站点限制）')
})

test('parseApiError maps connection failures to NETWORK', () => {
  const parsed = parseApiError(new Error('请求超时: AssetVault Pro 可能未启动'))
  assert.equal(parsed.code, 'NETWORK')
  assert.match(parsed.message, /无法连接 AssetVault Pro/)
})

test('parseApiError returns UNKNOWN for unstructured errors', () => {
  const parsed = parseApiError('something odd')
  assert.equal(parsed.code, 'UNKNOWN')
  assert.equal(parsed.message, 'something odd')
})
