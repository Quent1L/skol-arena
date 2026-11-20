import http from '@/config/ApiConfig'
import type {
  ClientGameRule,
  CreateGameRuleData,
  UpdateGameRuleData,
} from '@skol-arena/shared/types/index'

const BASE_URL = '/api/game-rules'

/**
 * Raw API calls to backend - no business logic here
 */
export const gameRulesApi = {
  async list(): Promise<ClientGameRule[]> {
    const response = await http.get<ClientGameRule[]>(BASE_URL)
    return response.data
  },

  async getById(id: string): Promise<ClientGameRule> {
    const response = await http.get<ClientGameRule>(`${BASE_URL}/${id}`)
    return response.data
  },

  async create(data: CreateGameRuleData): Promise<ClientGameRule> {
    const response = await http.post<ClientGameRule>(BASE_URL, data)
    return response.data
  },

  async update(id: string, data: UpdateGameRuleData): Promise<ClientGameRule> {
    const response = await http.patch<ClientGameRule>(`${BASE_URL}/${id}`, data)
    return response.data
  },

  async delete(id: string): Promise<void> {
    await http.delete(`${BASE_URL}/${id}`)
  },
}
