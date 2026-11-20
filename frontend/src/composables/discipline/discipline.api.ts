import http from '@/config/ApiConfig'
import type {
  Discipline,
  CreateDisciplineRequestData,
  UpdateDisciplineRequestData,
  ImpactedCompetition,
  PropagationResult,
} from '@skol-arena/shared/types/index'

const BASE_URL = '/api/disciplines'

export interface InteractionModeOption {
  value: string
  label: string
}

export const disciplineApi = {
  async list(includeArchived = false): Promise<Discipline[]> {
    const params = includeArchived ? { includeArchived: 'true' } : undefined
    const response = await http.get<Discipline[]>(BASE_URL, { params })
    return response.data
  },

  async listInteractionModes(): Promise<InteractionModeOption[]> {
    const response = await http.get<InteractionModeOption[]>(`${BASE_URL}/interaction-modes`)
    return response.data
  },

  async getById(id: string): Promise<Discipline> {
    const response = await http.get<Discipline>(`${BASE_URL}/${id}`)
    return response.data
  },

  async create(payload: CreateDisciplineRequestData): Promise<Discipline> {
    const response = await http.post<Discipline>(BASE_URL, payload)
    return response.data
  },

  async update(id: string, payload: UpdateDisciplineRequestData): Promise<Discipline> {
    const response = await http.patch<Discipline>(`${BASE_URL}/${id}`, payload)
    return response.data
  },

  /** Non-finished competitions a discipline edit could still be pushed to. */
  async listImpactedCompetitions(id: string): Promise<ImpactedCompetition[]> {
    const response = await http.get<ImpactedCompetition[]>(
      `${BASE_URL}/${id}/impacted-competitions`,
    )
    return response.data
  },

  async propagate(id: string, tournamentIds: string[]): Promise<PropagationResult[]> {
    const response = await http.post<PropagationResult[]>(`${BASE_URL}/${id}/propagate`, {
      tournamentIds,
    })
    return response.data
  },

  async archive(id: string): Promise<Discipline> {
    const response = await http.post<Discipline>(`${BASE_URL}/${id}/archive`)
    return response.data
  },

  async restore(id: string): Promise<Discipline> {
    const response = await http.post<Discipline>(`${BASE_URL}/${id}/restore`)
    return response.data
  },

  async delete(id: string): Promise<{ success: boolean; message: string }> {
    const response = await http.delete<{ success: boolean; message: string }>(`${BASE_URL}/${id}`)
    return response.data
  },
}
