import type { InjectionKey, Ref } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

/**
 * Provided false by a stats screen whose boards rank fixed teams: their ids are team
 * ids, and a team has no page, so the rows must not link to /players/:id.
 */
export const STAT_ROWS_ARE_PLAYERS: InjectionKey<Readonly<Ref<boolean>>> =
  Symbol('statRowsArePlayers')

export function playerLink(playerId: string, tournamentId?: string | null): RouteLocationRaw {
  return {
    path: `/players/${playerId}`,
    query: tournamentId ? { tournamentId } : {},
  }
}
