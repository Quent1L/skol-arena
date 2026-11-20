import type { ClientRankTier, PlayerCareerSeason } from '@skol-arena/shared/types/index'
import { getTierForMmr } from './tier-math'

/**
 * Pure career arithmetic, kept out of `ranked.service` so components and tests can
 * import it without pulling in that file's i18n dependency — same split as `tier-math`.
 */

/** Anchor the career card carries, and that the link to it targets. */
export const CAREER_ANCHOR = 'ranked-career'

export type CareerPeak = {
  mmr: number
  seasonId: string
  seasonName: string
  /** The tier that MMR was worth on the ladder in force that season, not today's. */
  tier: ClientRankTier | null
}

export type CareerDisciplineGroup = {
  disciplineId: string | null
  disciplineName: string | null
  disciplineIcon: string | null
  seasons: PlayerCareerSeason[]
}

function endedAt(season: PlayerCareerSeason): number {
  return new Date(season.endDate).getTime()
}

/**
 * The player's all-time record in one discipline, and the season that set it.
 *
 * `rank_tiers` is per season and its thresholds move, so the peak is resolved
 * against the ladder of the season it was reached in: 1850 two seasons ago means
 * what 1850 meant then. Ties go to the oldest season — that is when the record
 * was actually set, a later run only matched it.
 */
export function careerPeak(
  seasons: PlayerCareerSeason[],
  disciplineId: string | null | undefined,
): CareerPeak | null {
  const scoped = disciplineId
    ? seasons.filter((season) => season.discipline?.id === disciplineId)
    : seasons
  if (scoped.length === 0) return null

  const best = scoped.reduce((current, season) => {
    if (season.peakMmr !== current.peakMmr) {
      return season.peakMmr > current.peakMmr ? season : current
    }
    return endedAt(season) < endedAt(current) ? season : current
  }, scoped[0])

  return {
    mmr: best.peakMmr,
    seasonId: best.seasonId,
    seasonName: best.seasonName,
    tier: best.tiers.length ? getTierForMmr(best.peakMmr, best.tiers) : null,
  }
}

/**
 * Seasons grouped by discipline, newest run first inside each group and the most
 * recently active discipline first. Seasons whose discipline was deleted
 * (`tournaments.discipline_id` is ON DELETE SET NULL) land in a trailing null group
 * rather than disappearing.
 */
export function groupCareerByDiscipline(seasons: PlayerCareerSeason[]): CareerDisciplineGroup[] {
  const groups = new Map<string, CareerDisciplineGroup>()

  for (const season of seasons) {
    const key = season.discipline?.id ?? ''
    const group = groups.get(key) ?? {
      disciplineId: season.discipline?.id ?? null,
      disciplineName: season.discipline?.name ?? null,
      disciplineIcon: season.discipline?.icon ?? null,
      seasons: [],
    }
    group.seasons.push(season)
    groups.set(key, group)
  }

  for (const group of groups.values()) {
    group.seasons.sort((a, b) => endedAt(b) - endedAt(a))
  }

  return [...groups.values()].sort((a, b) => {
    if (a.disciplineId === null) return 1
    if (b.disciplineId === null) return -1
    return endedAt(b.seasons[0]) - endedAt(a.seasons[0])
  })
}
