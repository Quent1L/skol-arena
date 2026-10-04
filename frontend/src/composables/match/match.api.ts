import http from '@/config/ApiConfig'
import type {
  ClientMatchModel,
  ClientMatchDetail,
  ClientCreateMatchRequest,
  ClientUpdateMatchRequest,
  ReportMatchResultRequestData,
  ConfirmMatchRequestData,
  ContestMatchRequestData,
  RespondToMatchRequestData,
  FinalizeMatchRequestData,
  ClientValidateMatchRequest,
  ListMatchCardsQuery,
  PaginatedMatchCards,
} from '@skol-arena/shared/types/index'

const BASE_URL = '/api/matches'

/**
 * Raw API calls to backend - no business logic here
 */
export const matchApi = {
  /**
   * Create a new match
   * @param payload - Match data with Date objects (will be serialized to ISO strings)
   * @returns Match with Date objects (converted by interceptor)
   */
  async create(payload: ClientCreateMatchRequest): Promise<ClientMatchModel> {
    const response = await http.post<ClientMatchModel>(BASE_URL, payload)
    return response.data
  },

  /**
   * List matches with optional filters (paginated)
   * @returns Paginated match cards with Date objects (converted by interceptor)
   */
  async list(
    filters?: Omit<Partial<ListMatchCardsQuery>, 'bracketMode'> & {
      bracketMode?: 'true' | 'false'
    },
  ): Promise<PaginatedMatchCards> {
    const response = await http.get<PaginatedMatchCards>(BASE_URL, {
      params: filters,
    })
    return response.data
  },

  /**
   * Get match by ID
   * @returns Match with Date objects (converted by interceptor)
   */
  async getById(id: string): Promise<ClientMatchDetail> {
    const response = await http.get<ClientMatchDetail>(`${BASE_URL}/${id}`)
    return response.data
  },

  /**
   * Update match
   * @param payload - Match data with Date objects (will be serialized to ISO strings)
   * @returns Match with Date objects (converted by interceptor)
   */
  async update(id: string, payload: ClientUpdateMatchRequest): Promise<ClientMatchModel> {
    const response = await http.patch<ClientMatchModel>(`${BASE_URL}/${id}`, payload)
    return response.data
  },

  /**
   * Delete match
   */
  async delete(id: string): Promise<{ success: boolean; message: string }> {
    const response = await http.delete<{ success: boolean; message: string }>(`${BASE_URL}/${id}`)
    return response.data
  },

  /**
   * Report match result
   * @returns Match with Date objects (converted by interceptor)
   */
  async reportResult(id: string, payload: ReportMatchResultRequestData): Promise<ClientMatchModel> {
    const response = await http.post<ClientMatchModel>(`${BASE_URL}/${id}/report`, payload)
    return response.data
  },

  /**
   * Confirm match result
   * @returns Match with Date objects (converted by interceptor)
   */
  async confirmResult(
    id: string,
    payload: ConfirmMatchRequestData = {},
  ): Promise<ClientMatchModel> {
    const response = await http.post<ClientMatchModel>(`${BASE_URL}/${id}/confirm`, payload)
    return response.data
  },

  /**
   * Contest match result
   * @returns Match with Date objects (converted by interceptor)
   */
  async contestResult(id: string, payload: ContestMatchRequestData): Promise<ClientMatchModel> {
    const response = await http.post<ClientMatchModel>(`${BASE_URL}/${id}/contest`, payload)
    return response.data
  },

  /**
   * Unified respond to match (agree or dispute, pre or post finalization)
   */
  async respondToMatch(id: string, payload: RespondToMatchRequestData): Promise<ClientMatchDetail> {
    const response = await http.post<ClientMatchDetail>(`${BASE_URL}/${id}/respond`, payload)
    return response.data
  },

  /**
   * Finalize match (admin only)
   * @returns Match with Date objects (converted by interceptor)
   */
  async finalize(id: string, payload: FinalizeMatchRequestData): Promise<ClientMatchModel> {
    const response = await http.post<ClientMatchModel>(`${BASE_URL}/${id}/finalize`, payload)
    return response.data
  },

  /**
   * Cancel a match
   */
  async cancel(id: string): Promise<ClientMatchModel> {
    const response = await http.post<ClientMatchModel>(`${BASE_URL}/${id}/cancel`)
    return response.data
  },

  /**
   * Validate match possibility
   * @param payload - Validation data with Date objects (will be serialized to ISO strings)
   */
  async validate(payload: ClientValidateMatchRequest): Promise<{
    valid: boolean
    errors: string[]
    warnings: string[]
  }> {
    const response = await http.post<{
      valid: boolean
      errors: string[]
      warnings: string[]
    }>(`${BASE_URL}/validate`, payload)
    return response.data
  },
}
