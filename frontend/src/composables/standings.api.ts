import http from '@/config/ApiConfig'
import type { StandingsResult } from '@skol-arena/shared/types/index'

const BASE_URL = '/api/tournaments'

/**
 * Raw API calls to backend - no business logic here
 */
export const standingsApi = {
  /**
   * Get official standings (finalized matches only)
   */
  async getOfficial(tournamentId: string): Promise<StandingsResult> {
    const response = await http.get<StandingsResult>(
      `${BASE_URL}/${tournamentId}/standings/official`,
    )
    return response.data
  },

  /**
   * Get provisional standings (reported + finalized matches)
   */
  async getProvisional(tournamentId: string): Promise<StandingsResult> {
    const response = await http.get<StandingsResult>(
      `${BASE_URL}/${tournamentId}/standings/provisional`,
    )
    return response.data
  },
}
