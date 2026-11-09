import { describe, it, expect } from 'vitest'
import { SCORING_DEFAULTS, type ClientBaseTournament } from '@skol-arena/shared'
import { toStandingsConfig } from '../standings-config'

const tournament = (overrides: Partial<ClientBaseTournament> = {}) =>
  ({
    minTeamSize: 1,
    maxTeamSize: 2,
    minScore: 0,
    maxScore: 21,
    disciplineId: 'd1',
    ...overrides,
  }) as ClientBaseTournament

describe('toStandingsConfig', () => {
  it('flattens the scoring and the team and score bounds', () => {
    const config = toStandingsConfig(
      tournament({
        scoringConfig: { pointPerVictory: 5, pointPerDraw: 2, pointPerLoss: 1 },
      } as never),
    )

    expect(config).toEqual({
      pointPerVictory: 5,
      pointPerDraw: 2,
      pointPerLoss: 1,
      minTeamSize: 1,
      maxTeamSize: 2,
      minScore: 0,
      maxScore: 21,
      disciplineId: 'd1',
    })
  })

  it('falls back to the shared defaults without a scoring config', () => {
    const config = toStandingsConfig(tournament())

    expect(config.pointPerVictory).toBe(SCORING_DEFAULTS.pointPerVictory)
    expect(config.pointPerDraw).toBe(SCORING_DEFAULTS.pointPerDraw)
    expect(config.pointPerLoss).toBe(SCORING_DEFAULTS.pointPerLoss)
  })
})
