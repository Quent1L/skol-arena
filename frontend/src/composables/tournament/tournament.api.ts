import http from '@/config/ApiConfig'
import type {
  ClientBaseTournament,
  ClientTournamentSummary,
  ClientCreateTournamentRequest,
  ClientUpdateTournamentRequest,
  TournamentStatus,
  TournamentMode,
  TournamentRulesetResponse,
  TournamentEditability,
} from '@skol-arena/shared/types/index'

const BASE_URL = '/api/tournaments'

// Type alias for the API response (ClientBaseTournament - dates converted to Date by the interceptor)
export type TournamentResponse = ClientBaseTournament
export type TournamentListResponse = ClientTournamentSummary

// Interface for the list filters (based on ListTournamentsQuery from shared)
export interface ListTournamentsFilters {
  status?: TournamentStatus
  mode?: TournamentMode
  createdBy?: string
}

// Type for the creation payload (with Date dates that will be serialized to string)
export type CreateTournamentPayload = ClientCreateTournamentRequest

// Type for the update payload (with Date dates that will be serialized to string)
export type UpdateTournamentPayload = ClientUpdateTournamentRequest

/**
 * Raw API calls to backend - no business logic here
 */
export const tournamentApi = {
  /**
   * List all tournaments with optional filters
   */
  async list(filters?: ListTournamentsFilters): Promise<TournamentListResponse[]> {
    const response = await http.get<TournamentListResponse[]>(BASE_URL, {
      params: filters,
    })
    return response.data
  },

  /**
   * Get tournament by ID
   */
  async getById(id: string): Promise<TournamentResponse> {
    const response = await http.get<TournamentResponse>(`${BASE_URL}/${id}`)
    return response.data
  },

  /**
   * Create a new tournament
   */
  async create(payload: CreateTournamentPayload): Promise<TournamentResponse> {
    const response = await http.post<TournamentResponse>(BASE_URL, payload)
    return response.data
  },

  /**
   * Update tournament
   */
  async update(id: string, payload: UpdateTournamentPayload): Promise<TournamentResponse> {
    const response = await http.patch<TournamentResponse>(`${BASE_URL}/${id}`, payload)
    return response.data
  },

  /**
   * Change tournament status
   */
  async changeStatus(id: string, status: TournamentStatus): Promise<TournamentResponse> {
    const response = await http.patch<TournamentResponse>(`${BASE_URL}/${id}/status`, { status })
    return response.data
  },

  /**
   * Delete tournament
   */
  async delete(id: string): Promise<{ success: boolean; message: string }> {
    const response = await http.delete<{ success: boolean; message: string }>(`${BASE_URL}/${id}`)
    return response.data
  },

  /**
   * Recalculate points for all matches in a tournament (admin only)
   */
  /** Which fields the API will still accept, and what each costs. */
  async getEditability(id: string): Promise<TournamentEditability> {
    const response = await http.get<TournamentEditability>(`${BASE_URL}/${id}/editability`)
    return response.data
  },

  /**
   * The ruleset the competition is played under. This — not the live discipline —
   * is what match entry must offer and what the displayed results are based on.
   */
  async getRuleset(id: string): Promise<TournamentRulesetResponse> {
    const response = await http.get<TournamentRulesetResponse>(`${BASE_URL}/${id}/ruleset`)
    return response.data
  },

  async recalculatePoints(id: string): Promise<{ updatedMatches: number }> {
    const response = await http.post<{ updatedMatches: number }>(
      `${BASE_URL}/${id}/recalculate-points`,
    )
    return response.data
  },

  async clearCache(id: string): Promise<void> {
    await http.delete(`${BASE_URL}/${id}/cache`)
  },
}
