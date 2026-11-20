import { describe, expect, it } from 'vitest'
import { compareSemver, isVersionBelowMin } from '../semver'

describe('compareSemver', () => {
  it('treats identical versions as equal', () => {
    expect(compareSemver('1.18.1', '1.18.1')).toBe(0)
  })

  it('compares segments numerically, not lexicographically', () => {
    expect(compareSemver('1.9.0', '1.10.0')).toBeLessThan(0)
    expect(compareSemver('1.10.0', '1.9.0')).toBeGreaterThan(0)
  })

  it('gives priority to the most significant segment', () => {
    expect(compareSemver('2.0.0', '1.99.99')).toBeGreaterThan(0)
  })

  it('fills in missing segments with 0', () => {
    expect(compareSemver('1.2', '1.2.0')).toBe(0)
    expect(compareSemver('1.2', '1.2.1')).toBeLessThan(0)
  })

  it('accepts a v prefix', () => {
    expect(compareSemver('v1.18.1', '1.18.1')).toBe(0)
  })
})

describe('isVersionBelowMin', () => {
  it('requires the update under the floor', () => {
    expect(isVersionBelowMin('1.17.0', '1.18.0')).toBe(true)
  })

  it('requires nothing at or above the floor', () => {
    expect(isVersionBelowMin('1.18.0', '1.18.0')).toBe(false)
    expect(isVersionBelowMin('1.20.0', '1.18.0')).toBe(false)
  })

  it('requires nothing with no floor', () => {
    expect(isVersionBelowMin('1.17.0', null)).toBe(false)
    expect(isVersionBelowMin('1.17.0', '')).toBe(false)
  })

  // Blocking the app on a value we failed to read would be the worst failure mode.
  it('degrades to non-blocking on an unreadable value', () => {
    expect(isVersionBelowMin('1.17.0', 'latest')).toBe(false)
  })
})
