import assert from 'node:assert/strict'
import test from 'node:test'
import {
  dataUrlFitsDirectImport,
  DATAURL_MAX_DIRECT_JSON_CHARS,
  estimateDataUrlDecodedBytes,
  uniqueTempDownloadFilename,
} from '../src/shared/data-url-import.ts'

test('dataUrlFitsDirectImport respects JSON char budget', () => {
  const small = 'data:image/jpeg;base64,' + 'A'.repeat(1000)
  const large = 'data:image/jpeg;base64,' + 'A'.repeat(DATAURL_MAX_DIRECT_JSON_CHARS + 1)
  assert.equal(dataUrlFitsDirectImport(small), true)
  assert.equal(dataUrlFitsDirectImport(large), false)
  assert.equal(dataUrlFitsDirectImport(small, 0), false)
})

test('estimateDataUrlDecodedBytes approximates binary size', () => {
  const b64 = 'AAAA'
  const url = `data:image/png;base64,${b64}`
  assert.equal(estimateDataUrlDecodedBytes(url), 3)
})

test('uniqueTempDownloadFilename prefixes AssetVault_Temp uuid', () => {
  const name = uniqueTempDownloadFilename('screenshot-fullpage-1.jpg', 'test-uuid')
  assert.equal(name, 'AssetVault_Temp/test-uuid-screenshot-fullpage-1.jpg')
})
