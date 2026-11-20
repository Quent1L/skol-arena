import http from '@/config/ApiConfig'
import type {
  OutcomeReason,
  CreateOutcomeReasonRequestData,
  UpdateOutcomeReasonRequestData,
} from '@skol-arena/shared/types/index'

const BASE_URL = '/api/outcome-reasons'

export const outcomeReasonApi = {
  async list(outcomeTypeId?: string): Promise<OutcomeReason[]> {
    const params = outcomeTypeId ? { outcomeTypeId } : undefined
    const response = await http.get<OutcomeReason[]>(BASE_URL, { params })
    return response.data
  },

  async getById(id: string): Promise<OutcomeReason> {
    const response = await http.get<OutcomeReason>(`${BASE_URL}/${id}`)
    return response.data
  },

  async create(payload: CreateOutcomeReasonRequestData): Promise<OutcomeReason> {
    const response = await http.post<OutcomeReason>(BASE_URL, payload)
    return response.data
  },

  async update(id: string, payload: UpdateOutcomeReasonRequestData): Promise<OutcomeReason> {
    const response = await http.patch<OutcomeReason>(`${BASE_URL}/${id}`, payload)
    return response.data
  },

  async delete(id: string): Promise<{ success: boolean; message: string }> {
    const response = await http.delete<{ success: boolean; message: string }>(`${BASE_URL}/${id}`)
    return response.data
  },
}
