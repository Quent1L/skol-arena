import type { ClientRankTier } from '@skol-arena/shared'
import { getNextTier, getPrevTier, getTierForMmr, TIER_SIZE } from './tier-math'

export type MmrBarDirection = 'up' | 'down' | 'flat'

/**
 * One tier's worth of bar travel. A move that stays inside a tier produces a
 * single segment; a promotion or demotion produces one per tier crossed, so the
 * bar can complete the tier being left before the next one starts filling.
 */
export interface MmrBarSegment {
  tier: ClientRankTier | null
  minMmr: number
  maxMmr: number
  /** `maxMmr` is synthetic — the top tier has no ceiling to show the player. */
  isOpenEnded: boolean
  /** Counter value when this segment starts — always the previous segment's `mmrTo`. */
  mmrFrom: number
  mmrTo: number
  fromPct: number
  toPct: number
  direction: MmrBarDirection
  isFinal: boolean
}

export interface BuildMmrBarSegmentsOptions {
  /** Backend-authoritative levels; fall back to deriving the tier from the MMR. */
  tierBeforeLevel?: number | null
  tierAfterLevel?: number | null
  maxIntermediateSegments?: number
}

/**
 * Safety net for a cascade recalculation that moves a player several tiers at
 * once: without it the timeline would grow one ~1.5 s beat per tier crossed.
 */
const DEFAULT_MAX_INTERMEDIATE_SEGMENTS = 2

interface Bounds {
  min: number
  max: number
  isOpenEnded: boolean
}

/**
 * The MMR window a tier spans. The top tier has no next tier to close it, so it
 * borrows the width of the tier below (or `TIER_SIZE`) rather than reporting a
 * flat 100 % — otherwise the best players would watch a bar that never moves.
 */
export function getTierBounds(tier: ClientRankTier, allTiers: ClientRankTier[]): Bounds {
  const next = getNextTier(tier, allTiers)
  if (next && next.minMmr > tier.minMmr) {
    return { min: tier.minMmr, max: next.minMmr, isOpenEnded: false }
  }
  const prev = getPrevTier(tier, allTiers)
  const width = prev ? tier.minMmr - prev.minMmr : TIER_SIZE
  return { min: tier.minMmr, max: tier.minMmr + Math.max(width, TIER_SIZE), isOpenEnded: true }
}

function percentIn(mmr: number, bounds: Bounds): number {
  const range = bounds.max - bounds.min
  if (range <= 0) return 100
  return Math.min(100, Math.max(0, ((mmr - bounds.min) / range) * 100))
}

export function tierPercent(
  mmr: number,
  tier: ClientRankTier | null,
  allTiers: ClientRankTier[],
): number {
  if (!tier) return 0
  return percentIn(mmr, getTierBounds(tier, allTiers))
}

/**
 * No tier table (empty season, or a player still in placement): anchor a
 * synthetic window on the value so the bar still shows movement.
 */
function boundsFor(
  tier: ClientRankTier | null,
  mmrFrom: number,
  mmrTo: number,
  allTiers: ClientRankTier[],
): Bounds {
  if (tier) return getTierBounds(tier, allTiers)
  const min = Math.floor(Math.min(mmrFrom, mmrTo) / TIER_SIZE) * TIER_SIZE
  return { min, max: min + TIER_SIZE, isOpenEnded: true }
}

function makeSegment(
  tier: ClientRankTier | null,
  mmrFrom: number,
  mmrTo: number,
  allTiers: ClientRankTier[],
  isFinal: boolean,
): MmrBarSegment {
  const bounds = boundsFor(tier, mmrFrom, mmrTo, allTiers)
  return {
    tier,
    minMmr: bounds.min,
    maxMmr: bounds.max,
    isOpenEnded: bounds.isOpenEnded,
    mmrFrom,
    mmrTo,
    fromPct: percentIn(mmrFrom, bounds),
    toPct: percentIn(mmrTo, bounds),
    direction: directionOf(mmrFrom, mmrTo),
    isFinal,
  }
}

function directionOf(from: number, to: number): MmrBarDirection {
  if (to > from) return 'up'
  return to < from ? 'down' : 'flat'
}

function resolveTier(
  mmr: number,
  level: number | null | undefined,
  allTiers: ClientRankTier[],
): ClientRankTier | null {
  if (level != null) {
    const byLevel = allTiers.find((tier) => tier.level === level)
    if (byLevel) return byLevel
  }
  return getTierForMmr(mmr, allTiers)
}

/** The tiers travelled through, endpoints included, in travel order. */
function tierPath(
  before: ClientRankTier,
  after: ClientRankTier,
  allTiers: ClientRankTier[],
  maxIntermediate: number,
): ClientRankTier[] {
  const lo = Math.min(before.level, after.level)
  const hi = Math.max(before.level, after.level)
  const between = [...allTiers]
    .sort((a, b) => a.level - b.level)
    .filter((tier) => tier.level > lo && tier.level < hi)
  if (after.level <= before.level) between.reverse()
  const ordered = between
  return [before, ...ordered.slice(0, maxIntermediate), after]
}

/**
 * Splits a MMR move into the bar segments that render it. Each segment picks up
 * where the previous one stopped, so the counter never jumps even when the path
 * is truncated by `maxIntermediateSegments` — the percentages clamp instead.
 */
export function buildMmrBarSegments(
  mmrBefore: number,
  mmrAfter: number,
  tiers: ClientRankTier[],
  options: BuildMmrBarSegmentsOptions = {},
): MmrBarSegment[] {
  const before = resolveTier(mmrBefore, options.tierBeforeLevel, tiers)
  const after = resolveTier(mmrAfter, options.tierAfterLevel, tiers)

  if (!before || !after || before.level === after.level) {
    return [makeSegment(after ?? before, mmrBefore, mmrAfter, tiers, true)]
  }

  const path = tierPath(
    before,
    after,
    tiers,
    options.maxIntermediateSegments ?? DEFAULT_MAX_INTERMEDIATE_SEGMENTS,
  )
  const goingUp = after.level > before.level
  let cursor = mmrBefore

  return path.map((tier, index) => {
    const isFinal = index === path.length - 1
    const bounds = getTierBounds(tier, tiers)
    const edge = goingUp ? bounds.max : bounds.min
    const mmrTo = isFinal ? mmrAfter : edge
    const segment = makeSegment(tier, cursor, mmrTo, tiers, isFinal)
    cursor = mmrTo
    return segment
  })
}
