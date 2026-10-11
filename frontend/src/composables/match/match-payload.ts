import type {
  ClientCreateMatchRequest,
  ClientUpdateMatchRequest,
  MatchSideResultInput,
} from '@skol-arena/shared/types/index'
import type { MatchFormState } from './match-form.context'
import { firstPlaceCount, isCompleteRanking } from './match-ranking'

/**
 * Requests the match wizard sends, built once for both steppers. A duel keeps the
 * two-side fields (scoreA / scoreB / winnerPosition) the API has always taken; a
 * match of three sides or more reports a rank and a score per side instead.
 */

interface ResultRules {
  scoreEnabled?: boolean | null
  allowDraw?: boolean | null
  minScore?: number | null
  maxScore?: number | null
}

export interface MatchRequestOptions {
  tournamentId: string
  /** A match dated in the future is only scheduled: it carries no result. */
  isScheduled: boolean
  scoreEnabled: boolean
}

function isNwayForm(state: MatchFormState): boolean {
  return state.sides.length > 2
}

function sideResults(state: MatchFormState, scoreEnabled: boolean): MatchSideResultInput[] {
  return state.sides.map((side) => ({
    position: side.position,
    rank: state.rankPerSide[side.position] ?? 1,
    score: scoreEnabled ? (state.scorePerSide[side.position] ?? 0) : null,
  }))
}

function outcomeFields(state: MatchFormState, isScheduled: boolean) {
  return {
    outcomeTypeId: isScheduled ? undefined : (state.outcomeTypeId ?? undefined),
    outcomeReasonId: isScheduled ? undefined : (state.outcomeReasonId ?? undefined),
  }
}

/** The two-side result fields; 0 is the UI's "draw" pick, sent as a null winner. */
function duelResult(state: MatchFormState, isScheduled: boolean) {
  return {
    scoreA: isScheduled ? 0 : (state.scorePerSide[1] ?? 0),
    scoreB: isScheduled ? 0 : (state.scorePerSide[2] ?? 0),
    winnerPosition: isScheduled || state.winnerPosition === 0 ? null : state.winnerPosition,
  }
}

export function buildCreateMatchRequest(
  state: MatchFormState,
  options: MatchRequestOptions,
): ClientCreateMatchRequest {
  const { tournamentId, isScheduled, scoreEnabled } = options
  const base = {
    tournamentId,
    playedAt: state.playedAt ?? new Date(),
    status: isScheduled ? ('scheduled' as const) : ('reported' as const),
    ...outcomeFields(state, isScheduled),
  }
  if (!isNwayForm(state)) return { ...base, sides: state.sides, ...duelResult(state, isScheduled) }

  if (isScheduled) return { ...base, sides: state.sides }
  const results = new Map(sideResults(state, scoreEnabled).map((r) => [r.position, r]))
  return {
    ...base,
    sides: state.sides.map((side) => ({
      ...side,
      rank: results.get(side.position)?.rank,
      score: results.get(side.position)?.score ?? null,
    })),
  }
}

export function buildUpdateMatchRequest(
  state: MatchFormState,
  options: MatchRequestOptions,
): ClientUpdateMatchRequest {
  const { isScheduled, scoreEnabled } = options
  const base = {
    playedAt: state.playedAt ?? new Date(),
    status: isScheduled ? ('scheduled' as const) : ('reported' as const),
    ...outcomeFields(state, isScheduled),
  }
  if (!isNwayForm(state)) return { ...base, ...duelResult(state, isScheduled) }
  if (isScheduled) return base
  return { ...base, sideResults: sideResults(state, scoreEnabled) }
}

/** Whether the result step holds a result the API will take. */
export function isResultReady(state: MatchFormState, rules: ResultRules): boolean {
  if (isNwayForm(state)) {
    const positions = state.sides.map((s) => s.position)
    if (!isCompleteRanking(positions, state.rankPerSide)) return false
    if (!rules.allowDraw && firstPlaceCount(state.rankPerSide) > 1) return false
  } else if (state.winnerPosition === null) {
    return false
  }
  if (rules.scoreEnabled === false) return true
  const inRange = (v: number) =>
    (rules.minScore == null || v >= rules.minScore) &&
    (rules.maxScore == null || v <= rules.maxScore)
  return state.sides.every((s) => inRange(state.scorePerSide[s.position] ?? 0))
}
