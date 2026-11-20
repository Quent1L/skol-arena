import { describe, it, expect } from 'vitest'
import { makeTier } from '@/test-support/factories'
import { buildMmrBarSegments, getTierBounds, tierPercent } from '../mmr-progress'

// Four contiguous 200-wide tiers: 700 / 900 / 1100 / 1300.
const TIERS = [
  makeTier({ level: 1, name: 'Bronze', minMmr: 700 }),
  makeTier({ level: 2, name: 'Silver', minMmr: 900 }),
  makeTier({ level: 3, name: 'Gold', minMmr: 1100 }),
  makeTier({ level: 4, name: 'Diamond', minMmr: 1300 }),
]

const tierAt = (level: number) => TIERS.find((t) => t.level === level)!

describe('getTierBounds', () => {
  it('bounds a tier by the next one’s minMmr', () => {
    expect(getTierBounds(tierAt(2), TIERS)).toEqual({ min: 900, max: 1100, isOpenEnded: false })
  })

  it('gives the last tier the previous one’s width, and flags it as open-ended', () => {
    expect(getTierBounds(tierAt(4), TIERS)).toEqual({ min: 1300, max: 1500, isOpenEnded: true })
  })

  it('falls back to TIER_SIZE when the tier is alone', () => {
    const solo = makeTier({ level: 1, minMmr: 700 })
    expect(getTierBounds(solo, [solo])).toEqual({ min: 700, max: 900, isOpenEnded: true })
  })
})

describe('tierPercent', () => {
  it('positions the MMR within the tier’s window', () => {
    expect(tierPercent(1000, tierAt(2), TIERS)).toBe(50)
  })

  it('stays clamped between 0 and 100 outside the window', () => {
    expect(tierPercent(500, tierAt(2), TIERS)).toBe(0)
    expect(tierPercent(5000, tierAt(2), TIERS)).toBe(100)
  })

  it('is 0 with no tier', () => {
    expect(tierPercent(1000, null, TIERS)).toBe(0)
  })
})

describe('buildMmrBarSegments', () => {
  it('a single segment when the tier does not change', () => {
    const segments = buildMmrBarSegments(1000, 1040, TIERS)
    expect(segments).toHaveLength(1)
    expect(segments[0]).toMatchObject({
      fromPct: 50,
      toPct: 70,
      direction: 'up',
      isFinal: true,
    })
    expect(segments[0].tier?.name).toBe('Silver')
  })

  it('marks an intra-tier loss as downward', () => {
    const [segment] = buildMmrBarSegments(1040, 1000, TIERS)
    expect(segment.direction).toBe('down')
    expect(segment.fromPct).toBe(70)
    expect(segment.toPct).toBe(50)
  })

  it('rank up: the first segment ends at 100%, the second starts over at 0', () => {
    const segments = buildMmrBarSegments(1080, 1120, TIERS)
    expect(segments).toHaveLength(2)
    expect(segments[0]).toMatchObject({ fromPct: 90, toPct: 100, isFinal: false })
    expect(segments[0].tier?.name).toBe('Silver')
    expect(segments[1]).toMatchObject({ fromPct: 0, toPct: 10, isFinal: true })
    expect(segments[1].tier?.name).toBe('Gold')
  })

  it('rank down: the first segment empties the bar, the second starts over at 100%', () => {
    const segments = buildMmrBarSegments(1120, 1080, TIERS)
    expect(segments).toHaveLength(2)
    expect(segments[0]).toMatchObject({ fromPct: 10, toPct: 0, isFinal: false })
    expect(segments[0].tier?.name).toBe('Gold')
    expect(segments[1]).toMatchObject({ fromPct: 100, toPct: 90, isFinal: true })
    expect(segments[1].tier?.name).toBe('Silver')
  })

  it('crosses each intermediate tier and chains the MMR bounds with no gap', () => {
    const segments = buildMmrBarSegments(750, 1350, TIERS)
    expect(segments.map((s) => s.tier?.name)).toEqual(['Bronze', 'Silver', 'Gold', 'Diamond'])
    expect(segments.map((s) => [s.mmrFrom, s.mmrTo])).toEqual([
      [750, 900],
      [900, 1100],
      [1100, 1300],
      [1300, 1350],
    ])
  })

  it('caps intermediate segments while keeping the counter continuous', () => {
    const segments = buildMmrBarSegments(750, 1350, TIERS, { maxIntermediateSegments: 1 })
    expect(segments).toHaveLength(3)
    // The truncated tier jump stays continuous on the MMR side: each segment picks up where
    // the previous one stopped, and the percentage clamps itself.
    expect(segments[2].mmrFrom).toBe(segments[1].mmrTo)
    expect(segments[2].fromPct).toBe(0)
  })

  it('prefers the given levels over the tier inferred from the MMR', () => {
    const segments = buildMmrBarSegments(1000, 1000, TIERS, {
      tierBeforeLevel: 1,
      tierAfterLevel: 1,
    })
    expect(segments).toHaveLength(1)
    expect(segments[0].tier?.name).toBe('Bronze')
  })

  it('falls back to the MMR when the given level is unknown', () => {
    const segments = buildMmrBarSegments(1000, 1040, TIERS, { tierBeforeLevel: 99 })
    expect(segments[0].tier?.name).toBe('Silver')
  })

  it('with no tier table, keeps a synthetic window rather than a dead bar', () => {
    const [segment] = buildMmrBarSegments(1000, 1100, [])
    expect(segment.tier).toBeNull()
    expect(segment.minMmr).toBe(1000)
    expect(segment.maxMmr).toBe(1200)
    expect(segment.toPct).toBe(50)
  })
})
