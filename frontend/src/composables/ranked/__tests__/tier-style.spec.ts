import { describe, it, expect } from 'vitest'
import { makeTier } from '@/test-support/factories'
import {
  tierStyleIdx,
  getTierIconClass,
  getTierTextHex,
  TIER_ICON,
  TIER_TEXT_HEX,
} from '../tier-style'

describe('tierStyleIdx', () => {
  it('0 for a null tier', () => {
    expect(tierStyleIdx(null)).toBe(0)
  })

  it('level - 1 within the style range', () => {
    expect(tierStyleIdx(makeTier({ level: 1 }))).toBe(0)
    expect(tierStyleIdx(makeTier({ level: 3 }))).toBe(2)
    expect(tierStyleIdx(makeTier({ level: 5 }))).toBe(4)
  })

  it('clamps to the last style for levels beyond', () => {
    expect(tierStyleIdx(makeTier({ level: 9 }))).toBe(TIER_ICON.length - 1)
  })
})

describe('getTierIconClass', () => {
  it('prefers the tier’s iconClass', () => {
    expect(getTierIconClass(makeTier({ level: 2, iconClass: 'fa fa-fire' }))).toBe('fa fa-fire')
  })

  it('falls back to the per-level icon', () => {
    expect(getTierIconClass(makeTier({ level: 2, iconClass: null }))).toBe(TIER_ICON[1])
  })

  it('null tier → first level’s icon', () => {
    expect(getTierIconClass(null)).toBe(TIER_ICON[0])
  })
})

describe('getTierTextHex', () => {
  it('color by level', () => {
    expect(getTierTextHex(makeTier({ level: 3 }))).toBe(TIER_TEXT_HEX[2])
  })

  it('null tier → default gray', () => {
    expect(getTierTextHex(null)).toBe('#9ca3af')
  })
})
