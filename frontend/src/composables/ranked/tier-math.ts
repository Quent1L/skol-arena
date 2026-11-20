import type { ClientRankTier } from '@skol-arena/shared/types/index'

/**
 * Pure tier arithmetic, kept out of `ranked.service` so that importing it does
 * not drag in the i18n singleton that module instantiates. `ranked.service`
 * re-exports everything here, so existing call sites are unaffected.
 */

export const TIER_SIZE = 200
export const MMR_FLOOR = 700

export function getTierForMmr(mmr: number, allTiers: ClientRankTier[]): ClientRankTier | null {
  if (!allTiers.length) return null
  return (
    [...allTiers].sort((a, b) => b.level - a.level).find((tier) => mmr >= tier.minMmr) ??
    allTiers[0]
  )
}

// Neighbours are resolved by order, never by `level ± 1`: levels are kept
// contiguous server-side, but a season edited before that guarantee existed can
// still have holes.
export function getNextTier(
  tier: ClientRankTier,
  allTiers: ClientRankTier[],
): ClientRankTier | null {
  return [...allTiers].sort((a, b) => a.level - b.level).find((t) => t.level > tier.level) ?? null
}

export function getPrevTier(
  tier: ClientRankTier,
  allTiers: ClientRankTier[],
): ClientRankTier | null {
  return [...allTiers].sort((a, b) => b.level - a.level).find((t) => t.level < tier.level) ?? null
}

export function getSubRank(
  mmr: number,
  tier: ClientRankTier,
  allTiers: ClientRankTier[],
): number | null {
  if (tier.subRanks <= 1) return null
  const nextTier = getNextTier(tier, allTiers)
  const prevTier = getPrevTier(tier, allTiers)
  const rangeTop =
    nextTier?.minMmr ?? tier.minMmr + (prevTier ? tier.minMmr - prevTier.minMmr : 1000)
  const range = rangeTop - tier.minMmr
  if (range <= 0) return 1
  const subRankRange = range / tier.subRanks
  const position = mmr - tier.minMmr
  const raw = tier.subRanks - Math.floor(position / subRankRange)
  return Math.max(1, Math.min(tier.subRanks, raw))
}

export function getLp(mmr: number, tier: ClientRankTier): number {
  if (mmr < MMR_FLOOR) return 0
  return Math.max(0, mmr - tier.minMmr)
}

export function isTopTier(tier: ClientRankTier, allTiers: ClientRankTier[]): boolean {
  return getNextTier(tier, allTiers) === null
}
