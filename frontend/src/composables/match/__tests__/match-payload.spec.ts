import { describe, it, expect } from 'vitest'

import type { MatchFormState } from '../match-form.context'
import { buildCreateMatchRequest, buildUpdateMatchRequest, isResultReady } from '../match-payload'

const playedAt = new Date('2026-06-01T10:00:00Z')

function state(overrides: Partial<MatchFormState> = {}): MatchFormState {
  return {
    playedAt,
    sides: [
      { position: 1, playerIds: ['a'] },
      { position: 2, playerIds: ['b'] },
    ],
    allPlayerIds: ['a', 'b'],
    winnerPosition: 2,
    scorePerSide: { 1: 3, 2: 5 },
    rankPerSide: {},
    outcomeTypeId: null,
    outcomeReasonId: null,
    ...overrides,
  }
}

const threeSides = {
  sides: [
    { position: 1, playerIds: ['a'] },
    { position: 2, playerIds: ['b'] },
    { position: 3, playerIds: ['c'] },
  ],
  allPlayerIds: ['a', 'b', 'c'],
  winnerPosition: null,
  scorePerSide: { 1: 4, 2: 9, 3: 1 },
  rankPerSide: { 1: 2, 2: 1, 3: 3 },
}

const options = { tournamentId: 't1', isScheduled: false, scoreEnabled: true }

describe('match requests', () => {
  it('keeps the two-side fields for a duel', () => {
    const request = buildCreateMatchRequest(state(), options)

    expect(request).toMatchObject({ status: 'reported', scoreA: 3, scoreB: 5, winnerPosition: 2 })
    expect(request.sides?.[0]).not.toHaveProperty('rank')
  })

  it('sends the draw pick as a null winner', () => {
    expect(buildCreateMatchRequest(state({ winnerPosition: 0 }), options).winnerPosition).toBeNull()
  })

  it('carries a rank and a score per side from three sides on', () => {
    const request = buildCreateMatchRequest(state(threeSides), options)

    expect(request).not.toHaveProperty('scoreA')
    expect(request.sides?.map((s) => [s.rank, s.score])).toEqual([
      [2, 4],
      [1, 9],
      [3, 1],
    ])
  })

  it('sends no score per side when the competition keeps none', () => {
    const request = buildCreateMatchRequest(state(threeSides), { ...options, scoreEnabled: false })

    expect(request.sides?.every((s) => s.score === null)).toBe(true)
  })

  it('schedules a match of three sides without any result', () => {
    const request = buildCreateMatchRequest(state(threeSides), { ...options, isScheduled: true })

    expect(request.status).toBe('scheduled')
    expect(request.sides?.every((s) => s.rank === undefined)).toBe(true)
  })

  it('reports per-side results on an update', () => {
    const request = buildUpdateMatchRequest(state(threeSides), options)

    expect(request.sideResults).toEqual([
      { position: 1, rank: 2, score: 4 },
      { position: 2, rank: 1, score: 9 },
      { position: 3, rank: 3, score: 1 },
    ])
    expect(request).not.toHaveProperty('winnerPosition')
  })
})

describe('isResultReady', () => {
  it('needs a winner pick on a duel', () => {
    expect(isResultReady(state({ winnerPosition: null }), { scoreEnabled: true })).toBe(false)
    expect(isResultReady(state(), { scoreEnabled: true })).toBe(true)
  })

  it('needs a complete ranking from three sides on', () => {
    expect(isResultReady(state(threeSides), { scoreEnabled: true })).toBe(true)
    expect(
      isResultReady(state({ ...threeSides, rankPerSide: { 1: 1, 2: 2 } }), { scoreEnabled: true }),
    ).toBe(false)
  })

  it('refuses a shared first place where draws are not allowed', () => {
    const tied = state({ ...threeSides, rankPerSide: { 1: 1, 2: 1, 3: 3 } })

    expect(isResultReady(tied, { scoreEnabled: true, allowDraw: false })).toBe(false)
    expect(isResultReady(tied, { scoreEnabled: true, allowDraw: true })).toBe(true)
  })
})
