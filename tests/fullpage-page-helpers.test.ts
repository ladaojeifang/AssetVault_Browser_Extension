import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isFullpageScrollAtTarget,
  shouldForceHideFullpageFloatingOnLastFrame,
  shouldHideFullpageFloating,
  shouldKeepFullpageFloating,
  type FullpageFloatingMetrics,
} from '../src/shared/fullpage-page-helpers.ts'

function baseMetrics(overrides: Partial<FullpageFloatingMetrics> = {}): FullpageFloatingMetrics {
  return {
    position: 'fixed',
    display: 'block',
    visibility: 'visible',
    opacity: '1',
    clientWidth: 400,
    clientHeight: 48,
    rectTop: 800,
    rectBottom: 848,
    rectLeft: 0,
    rectRight: 400,
    styleRight: 'auto',
    styleTop: 'auto',
    styleBottom: '0px',
    styleHeight: '48px',
    styleWidth: '400px',
    innerWidth: 1200,
    innerHeight: 900,
    bodyClientWidth: 1200,
    ...overrides,
  }
}

describe('isFullpageScrollAtTarget', () => {
  it('allows 2px tolerance', () => {
    assert.equal(isFullpageScrollAtTarget(1000, 1002), true)
    assert.equal(isFullpageScrollAtTarget(1000, 998), true)
    assert.equal(isFullpageScrollAtTarget(1000, 1003), false)
  })
})

describe('shouldHideFullpageFloating', () => {
  it('hides typical top header', () => {
    const m = baseMetrics({
      clientHeight: 56,
      rectTop: 0,
      rectBottom: 56,
      styleTop: '0px',
      styleBottom: 'auto',
    })
    assert.equal(shouldKeepFullpageFloating(m), false)
    assert.equal(shouldHideFullpageFloating(m, false), true)
  })

  it('keeps narrow right sidebar', () => {
    const m = baseMetrics({
      clientWidth: 200,
      clientHeight: 900,
      rectTop: 0,
      rectBottom: 900,
      styleRight: '0px',
      styleTop: '0px',
      styleBottom: 'auto',
    })
    assert.equal(shouldKeepFullpageFloating(m), true)
    assert.equal(shouldHideFullpageFloating(m, false), false)
  })

  it('last frame force-hides bottom cookie bar', () => {
    const m = baseMetrics({
      clientWidth: 1200,
      clientHeight: 40,
      rectTop: 860,
      rectBottom: 900,
      rectRight: 1200,
      styleBottom: '0px',
      styleTop: '860px',
    })
    assert.equal(shouldKeepFullpageFloating(m), true)
    assert.equal(shouldHideFullpageFloating(m, false), false)
    assert.equal(shouldForceHideFullpageFloatingOnLastFrame(m), true)
    assert.equal(shouldHideFullpageFloating(m, true), true)
  })

  it('keeps large in-view block', () => {
    const m = baseMetrics({
      clientWidth: 1000,
      clientHeight: 800,
      rectTop: 100,
      rectBottom: 900,
    })
    assert.equal(shouldKeepFullpageFloating(m), true)
    assert.equal(shouldHideFullpageFloating(m, false), false)
  })
})
