import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { checkApiContract } from '../scripts/lib/check-api-contract.mjs'
import { openApiHasOperation, parseOpenApiPathMethods } from '../scripts/lib/openapi-paths.mjs'

describe('api contract', () => {
  it('extension-api-surface is covered by OpenAPI mirror', () => {
    const { ok, errors } = checkApiContract()
    assert.equal(ok, true, errors.join('\n'))
  })

  it('parseOpenApiPathMethods reads standard paths', () => {
    const yaml = `
paths:
  /app/info:
    get:
      tags: [app]
  /asset/fetchRemoteBody:
    post:
      tags: [asset]
`
    const map = parseOpenApiPathMethods(yaml)
    assert.equal(openApiHasOperation(map, '/app/info', 'GET'), true)
    assert.equal(openApiHasOperation(map, '/asset/fetchRemoteBody', 'POST'), true)
    assert.equal(openApiHasOperation(map, '/app/info', 'POST'), false)
  })
})
