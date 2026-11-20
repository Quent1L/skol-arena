import type { PlayerTournamentEntry } from '@skol-arena/shared/types/index'

/**
 * A player's competitions folded into one row per discipline and mode.
 *
 * Pure and outside the view so the exclusion rule below can be pinned by tests:
 * it decides what the generic block stops showing, and getting it wrong either
 * duplicates a season or hides it entirely.
 */
export type TournamentStatsGroup = {
  key: string
  discipline: string | null
  mode: string
  entries: PlayerTournamentEntry[]
  totalMatches: number
  wins: number
  draws: number
  losses: number
  winRate: number
}

export function groupTournamentHistory(
  history: PlayerTournamentEntry[],
  /**
   * Competitions another card already accounts for — the ranked seasons covered by
   * the career card. Only those are dropped, so a ranked season with entries but no
   * rated history still shows up here rather than nowhere.
   */
  excludedTournamentIds: ReadonlySet<string> = new Set(),
): TournamentStatsGroup[] {
  const map = new Map<
    string,
    Pick<TournamentStatsGroup, 'key' | 'discipline' | 'mode' | 'entries'>
  >()

  for (const entry of history) {
    if (excludedTournamentIds.has(entry.tournamentId)) continue
    const key = `${entry.disciplineName ?? ''}_${entry.mode}`
    if (!map.has(key)) {
      map.set(key, { key, discipline: entry.disciplineName ?? null, mode: entry.mode, entries: [] })
    }
    map.get(key)!.entries.push(entry)
  }

  const sum = (entries: PlayerTournamentEntry[], pick: (e: PlayerTournamentEntry) => number) =>
    entries.reduce((total, entry) => total + pick(entry), 0)

  return [...map.values()].map((group) => {
    const totalMatches = sum(group.entries, (e) => e.matchesPlayed)
    const wins = sum(group.entries, (e) => e.wins)
    return {
      ...group,
      totalMatches,
      wins,
      draws: sum(group.entries, (e) => e.draws),
      losses: sum(group.entries, (e) => e.losses),
      winRate: totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0,
    }
  })
}
