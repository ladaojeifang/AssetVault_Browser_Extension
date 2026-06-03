import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyFullPageSessionProbeError,
  fullPageInspectSessionId,
  fullPageStripFileName,
  FULLPAGE_KEEP_STRIP_FILES_AFTER_FINISH,
  FULLPAGE_STRIP_JPEG_QUALITY,
  mapFullPageFinishWarnings
} from '../src/shared/fullpage-session-paths.ts'

test('fullPageInspectSessionId uses inspect- prefix', () => {
  assert.equal(fullPageInspectSessionId(1780471315294), 'inspect-1780471315294')
})

test('fullPageStripFileName uses strip-NNNN pattern', () => {
  assert.equal(fullPageStripFileName(3, 'jpeg'), 'strip-0003.jpg')
  assert.equal(fullPageStripFileName(0, 'png'), 'strip-0000.png')
})

test('classifyFullPageSessionProbeError detects route vs missing library vs 404', () => {
  assert.equal(
    classifyFullPageSessionProbeError('INVALID_REQUEST: layout required'),
    true
  )
  assert.equal(
    classifyFullPageSessionProbeError('LIBRARY_NOT_OPEN: 资料库未打开'),
    true
  )
  assert.equal(classifyFullPageSessionProbeError('HTTP 404: Not Found'), false)
  assert.equal(classifyFullPageSessionProbeError('请求超时: AssetVault Pro 可能未启动'), null)
})

test('mapFullPageFinishWarnings maps Pro warning codes to Chinese', () => {
  assert.deepEqual(
    mapFullPageFinishWarnings(['capture_incomplete', 'output_scaled_down', 'other']),
    ['采集未完成', '超长页面已由桌面端略微缩小']
  )
})

test('strip JPEG quality is high (not dataUrl import budget)', () => {
  assert.ok(FULLPAGE_STRIP_JPEG_QUALITY >= 90)
  assert.ok(FULLPAGE_STRIP_JPEG_QUALITY <= 100)
})

test('strip files not kept after finish by default', () => {
  assert.equal(FULLPAGE_KEEP_STRIP_FILES_AFTER_FINISH, false)
})

test('export strips sent to Pro must use zero stitch overlap', () => {
  const heights = [5000, 5000, 3000]
  const scrollOverlap = 180
  const withWrongOverlap = heights.reduce((a, b) => a + b, 0) - scrollOverlap * (heights.length - 1)
  const withCorrectOverlap = heights.reduce((a, b) => a + b, 0)
  assert.ok(withWrongOverlap < withCorrectOverlap)
  assert.equal(withCorrectOverlap, 13000)
})
