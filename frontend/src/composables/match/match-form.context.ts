import type { InjectionKey, Ref } from 'vue'
import type { PlayerStandings } from './match-balance'
import type {
  ClientBaseTournament,
  ClientTeam,
  MatchSideInput,
  OutcomeType,
  OutcomeReason,
} from '@skol-arena/shared/types/index'

export interface MatchFormState {
  playedAt: Date | null
  sides: MatchSideInput[]
  allPlayerIds: string[]
  winnerPosition: number | null
  scorePerSide: Record<number, number>
  /** Placement per side position (1 = first, ties shared); read with 3+ sides only. */
  rankPerSide: Record<number, number>
  outcomeTypeId: string | null
  outcomeReasonId: string | null
}

export interface TournamentPlayer {
  id: string
  displayName: string
}

export interface MatchFormContext {
  formState: Ref<MatchFormState>
  activeStep: Ref<string>
  tournament: Ref<ClientBaseTournament | null>
  playersMap: Ref<Record<string, string>>
  teams: Ref<ClientTeam[]>
  participants: Ref<TournamentPlayer[]>
  outcomeTypes: Ref<OutcomeType[]>
  outcomeReasons: Ref<OutcomeReason[]>
  scoreInstructions: Ref<string | null>
  isLoading: Ref<boolean>
  /**
   * MMR of every selected player, as of the match date. Ranked seasons only;
   * `null` everywhere else, which is what hides the balance bar.
   */
  standings: Ref<PlayerStandings | null>
}

export const MATCH_FORM_KEY: InjectionKey<MatchFormContext> = Symbol('matchForm')
