import http from '@/config/ApiConfig'
import type {
  PlayerProfile,
  PlayerStatsResponse,
  PlayerStatsFilters,
  PlayerTournamentOption,
  PlayerComparisonResponse,
} from '@skol-arena/shared/types/index'

const BASE_URL = '/api/users'

/**
 * Raw API calls to backend - no business logic here
 */
export const playerApi = {
  async getProfile(playerId: string): Promise<PlayerProfile> {
    const response = await http.get<PlayerProfile>(`${BASE_URL}/${playerId}`)
    return response.data
  },

  async getTournaments(playerId: string): Promise<{ tournaments: PlayerTournamentOption[] }> {
    const response = await http.get<{ tournaments: PlayerTournamentOption[] }>(
      `${BASE_URL}/${playerId}/tournaments`,
    )
    return response.data
  },

  async getStats(playerId: string, filters?: PlayerStatsFilters): Promise<PlayerStatsResponse> {
    const response = await http.get<PlayerStatsResponse>(`${BASE_URL}/${playerId}/stats`, {
      params: filters,
    })
    return response.data
  },

  async search(query: string, limit?: number): Promise<PlayerProfile[]> {
    const response = await http.get<PlayerProfile[]>(`${BASE_URL}/search`, {
      params: { q: query, limit },
    })
    return response.data
  },

  async getComparison(
    playerAId: string,
    playerBId: string,
    filters?: PlayerStatsFilters,
  ): Promise<PlayerComparisonResponse> {
    const response = await http.get<PlayerComparisonResponse>(`${BASE_URL}/compare`, {
      params: { playerA: playerAId, playerB: playerBId, ...filters },
    })
    return response.data
  },
}
