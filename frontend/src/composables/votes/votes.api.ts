import http from '@/config/ApiConfig'
import type {
  AdminVoteStats,
  MyVoteStats,
  RevealedVoters,
  TournamentVoteStats,
  CastFairPlayVoteInput,
  MatchVotes,
  VotePrompt,
  VotePromptOutcome,
} from '@skol-arena/shared/types/index'

const BASE_URL = '/api'

/** Raw API calls, 1:1 with backend/src/routes/votes.route.ts. */
export const votesApi = {
  async get(matchId: string): Promise<MatchVotes> {
    return (await http.get<MatchVotes>(`${BASE_URL}/matches/${matchId}/votes`)).data
  },
  async castFairPlay(
    matchId: string,
    targetId: string,
    input: CastFairPlayVoteInput,
  ): Promise<MatchVotes> {
    return (
      await http.put<MatchVotes>(`${BASE_URL}/matches/${matchId}/fair-play/${targetId}`, input)
    ).data
  },
  async removeFairPlay(matchId: string, targetId: string): Promise<MatchVotes> {
    return (await http.delete<MatchVotes>(`${BASE_URL}/matches/${matchId}/fair-play/${targetId}`))
      .data
  },
  async castFairPlayTeamUp(matchId: string): Promise<MatchVotes> {
    return (await http.put<MatchVotes>(`${BASE_URL}/matches/${matchId}/fair-play`)).data
  },
  async declareSpectator(matchId: string): Promise<MatchVotes> {
    return (await http.put<MatchVotes>(`${BASE_URL}/matches/${matchId}/spectators/me`)).data
  },
  async withdrawSpectator(matchId: string): Promise<MatchVotes> {
    return (await http.delete<MatchVotes>(`${BASE_URL}/matches/${matchId}/spectators/me`)).data
  },
  async castMvp(matchId: string, targetId: string): Promise<MatchVotes> {
    return (await http.put<MatchVotes>(`${BASE_URL}/matches/${matchId}/mvp`, { targetId })).data
  },
  async removeMvp(matchId: string): Promise<MatchVotes> {
    return (await http.delete<MatchVotes>(`${BASE_URL}/matches/${matchId}/mvp`)).data
  },
  async promptForMatch(matchId: string): Promise<VotePrompt | null> {
    return (await http.get<VotePrompt | null>(`${BASE_URL}/matches/${matchId}/vote-prompt`)).data
  },
  async pendingPrompt(): Promise<VotePrompt | null> {
    return (await http.get<VotePrompt | null>(`${BASE_URL}/me/vote-prompt`)).data
  },
  async recordPrompt(matchId: string, outcome: VotePromptOutcome): Promise<void> {
    await http.post(`${BASE_URL}/matches/${matchId}/vote-prompt`, { outcome })
  },
  async publicStats(tournamentId: string): Promise<TournamentVoteStats> {
    return (
      await http.get<TournamentVoteStats>(`${BASE_URL}/tournaments/${tournamentId}/votes/stats`)
    ).data
  },
  async myStats(tournamentId: string): Promise<MyVoteStats> {
    return (await http.get<MyVoteStats>(`${BASE_URL}/tournaments/${tournamentId}/votes/stats/me`))
      .data
  },
  async adminStats(tournamentId: string): Promise<AdminVoteStats> {
    return (await http.get<AdminVoteStats>(`${BASE_URL}/tournaments/${tournamentId}/votes/admin`))
      .data
  },
  async reveal(tournamentId: string, playerId: string): Promise<RevealedVoters> {
    const url = `${BASE_URL}/tournaments/${tournamentId}/votes/admin/reveal/${playerId}`
    return (await http.post<RevealedVoters>(url)).data
  },
}
