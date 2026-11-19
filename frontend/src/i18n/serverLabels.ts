import { useI18n } from 'vue-i18n'
import type { BracketRound, ClientRankTier } from '@skol-arena/shared/types/index'

/**
 * Labels the server named by i18n key rather than by text. Rank tiers and bracket
 * rounds are written once, when a season or a bracket is created, and then read by
 * everyone: storing only the rendered text would freeze them in the language of
 * whoever pressed the button. The row carries the key, and these resolvers render
 * it in the locale picked in the app — same idea as `notification.i18n`.
 *
 * The stored text stays the fallback: rows written before the keys existed have
 * nothing else, and neither does a tier an organizer named by hand.
 */

/** The naming fields of a rank tier, structural so rewind's trimmed refs fit too. */
type NamedTier = Pick<ClientRankTier, 'name'> & { nameKey?: string | null }

/** The naming fields of a bracket round. */
type NamedRound = Pick<BracketRound, 'roundName' | 'roundNameKey' | 'translationParams'>

export function useServerLabels() {
  const { t, te } = useI18n()

  function render(key: string | null | undefined, fallback: string, params?: Record<string, unknown>): string {
    if (!key || !te(key)) return fallback
    return t(key, params ?? {})
  }

  function tierName(tier: NamedTier | null | undefined): string {
    if (!tier) return '—'
    return render(tier.nameKey && `ranked.tiers.${tier.nameKey}`, tier.name)
  }

  /** Tier name with its sub-rank, e.g. "Légende 2" — the counterpart of `getTierLabel`. */
  function tierLabel(tier: NamedTier | null | undefined, subRank: number | null): string {
    const name = tierName(tier)
    return tier && subRank !== null ? `${name} ${subRank}` : name
  }

  function roundName(round: NamedRound): string {
    const key = round.roundNameKey && `bracket.rounds.${round.roundNameKey}`
    return render(key, round.roundName, round.translationParams ?? undefined)
  }

  return { tierName, tierLabel, roundName }
}
