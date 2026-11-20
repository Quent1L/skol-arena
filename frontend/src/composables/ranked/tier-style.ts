import type { ClientRankTier } from '@skol-arena/shared'

export const TIER_ICON = [
  'fa fa-seedling',
  'fa fa-shield',
  'fa fa-star',
  'fa fa-gem',
  'fa fa-crown',
]
export const TIER_TEXT_HEX = ['#9ca3af', '#60a5fa', '#fbbf24', '#fb923c', '#a855f7']
export const TIER_TEXT_CLASS = [
  'text-gray-400',
  'text-blue-400',
  'text-amber-400',
  'text-orange-400',
  'text-purple-400',
]
export const TIER_BAR_CLASS = [
  'bg-gray-400',
  'bg-blue-400',
  'bg-amber-400',
  'bg-orange-400',
  'bg-purple-500',
]
export const TIER_CARD_CLASS = [
  'bg-gray-800/70',
  'bg-blue-950/60',
  'bg-amber-950/60',
  'bg-orange-950/60',
  'bg-purple-950/60',
]
export const TIER_ICON_BG_CLASS = [
  'bg-gray-600',
  'bg-blue-600',
  'bg-amber-500',
  'bg-orange-600',
  'bg-purple-600',
]
export const TIER_CARD_BG_CLASS = [
  'bg-gradient-to-b from-gray-700/80 to-gray-900',
  'bg-gradient-to-b from-blue-900/80 to-gray-900',
  'bg-gradient-to-b from-amber-900/80 to-gray-900',
  'bg-gradient-to-b from-orange-900/80 to-gray-900',
  'bg-gradient-to-b from-purple-900/80 to-gray-900',
]
export const TIER_PROGRESS_BAR_CLASS = [
  'bg-gray-500',
  'bg-blue-500',
  'bg-amber-400',
  'bg-orange-500',
  'bg-purple-500',
]
/** Hex twins of TIER_PROGRESS_BAR_CLASS, for bars painted through inline gradients. */
export const TIER_BAR_HEX = ['#6b7280', '#3b82f6', '#fbbf24', '#f97316', '#a855f7']

/**
 * Everything the styling reads off a tier. Narrower than `ClientRankTier` so a
 * rewind's frozen tier reference — which carries no thresholds — styles itself
 * through the very same table as a live one.
 */
export type StyleableTier = Pick<ClientRankTier, 'level' | 'iconClass'>

export function tierStyleIdx(tier: StyleableTier | null): number {
  if (!tier) return 0
  return Math.min(tier.level - 1, TIER_ICON.length - 1)
}

export function getTierIconClass(tier: StyleableTier | null): string {
  if (tier?.iconClass) return tier.iconClass
  return TIER_ICON[tierStyleIdx(tier)] ?? 'fa fa-circle'
}

export function getTierTextHex(tier: StyleableTier | null): string {
  return TIER_TEXT_HEX[tierStyleIdx(tier)] ?? '#9ca3af'
}

export function getTierBarHex(tier: StyleableTier | null): string {
  return TIER_BAR_HEX[tierStyleIdx(tier)] ?? '#6b7280'
}

export function getTierProgressBarClass(tier: StyleableTier | null): string {
  return TIER_PROGRESS_BAR_CLASS[tierStyleIdx(tier)] ?? 'bg-gray-500'
}
