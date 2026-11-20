import { SCORING_DEFAULTS, type ClientBaseTournament } from '@skol-arena/shared'

/**
 * Everything `StandingsTable` needs from the tournament it renders. Only the
 * points feed the legend; the rest drives the score and outcome-type panels.
 */
export interface StandingsTournamentConfig {
  pointPerVictory: number
  pointPerDraw: number
  pointPerLoss: number
  minTeamSize: number
  maxTeamSize: number
  minScore?: number | null
  maxScore?: number | null
  disciplineId?: string | null
}

/**
 * Flattens a tournament into the config the standings table expects. The
 * scoring satellite is absent on modes that award no points, so the shared
 * defaults stand in — the same fallback the backend applies.
 */
export function toStandingsConfig(tournament: ClientBaseTournament): StandingsTournamentConfig {
  return {
    pointPerVictory: tournament.scoringConfig?.pointPerVictory ?? SCORING_DEFAULTS.pointPerVictory,
    pointPerDraw: tournament.scoringConfig?.pointPerDraw ?? SCORING_DEFAULTS.pointPerDraw,
    pointPerLoss: tournament.scoringConfig?.pointPerLoss ?? SCORING_DEFAULTS.pointPerLoss,
    minTeamSize: tournament.minTeamSize,
    maxTeamSize: tournament.maxTeamSize,
    minScore: tournament.minScore,
    maxScore: tournament.maxScore,
    disciplineId: tournament.disciplineId,
  }
}
