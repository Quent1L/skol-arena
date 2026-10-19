import http from '@/config/ApiConfig'
import type {
  AvailableBadge,
  ClientPlayerBadge,
  ClientRule,
  ClientRuleFiringDetail,
  ClientRuleFiringFeed,
  ClientRuleFiringOverview,
  ClientRuleFiringStatsRow,
  CreateRuleData,
  FactDefinition,
  RuleAction,
  RuleFiringResult,
  RuleConditions,
  TestRuleResult,
  UpdateRuleData,
} from '@skol-arena/shared/types/index'

const BASE_URL = '/api/admin/rules'

export interface RuleListFilters {
  type?: 'message' | 'badge'
  triggerEvent?: string
  scope?: 'global' | 'discipline'
  isActive?: boolean
}

export interface RuleFiringFeedFilters {
  type?: 'message' | 'badge'
  ruleId?: string
  result?: RuleFiringResult
  includeHeld?: boolean
}

export interface CatalogFact extends FactDefinition {
  operators: string[]
}

/**
 * Raw API calls to backend - no business logic here
 */
export const rulesApi = {
  async list(filters: RuleListFilters = {}): Promise<ClientRule[]> {
    const response = await http.get<ClientRule[]>(BASE_URL, { params: filters })
    return response.data
  },

  async getById(id: string): Promise<ClientRule> {
    const response = await http.get<ClientRule>(`${BASE_URL}/${id}`)
    return response.data
  },

  async create(data: CreateRuleData): Promise<ClientRule> {
    const response = await http.post<ClientRule>(BASE_URL, data)
    return response.data
  },

  async update(id: string, data: UpdateRuleData): Promise<ClientRule> {
    const response = await http.patch<ClientRule>(`${BASE_URL}/${id}`, data)
    return response.data
  },

  async delete(id: string): Promise<void> {
    await http.delete(`${BASE_URL}/${id}`)
  },

  async getCatalog(triggerEvent: string): Promise<{ facts: CatalogFact[] }> {
    const response = await http.get<{ facts: CatalogFact[] }>(`${BASE_URL}/catalog`, {
      params: { triggerEvent },
    })
    return response.data
  },

  async test(payload: {
    triggerEvent: string
    conditions: RuleConditions
    action: RuleAction
    context: Record<string, unknown>
  }): Promise<TestRuleResult> {
    const response = await http.post<TestRuleResult>(`${BASE_URL}/test`, payload)
    return response.data
  },

  async getPlayerBadges(playerId: string): Promise<ClientPlayerBadge[]> {
    const response = await http.get<{ badges: ClientPlayerBadge[] }>(`/api/users/${playerId}/badges`)
    return response.data.badges
  },

  async getAvailableBadges(tournamentId: string, options: { withHolders?: boolean } = {}): Promise<AvailableBadge[]> {
    const response = await http.get<{ badges: AvailableBadge[] }>(
      `/api/tournaments/${tournamentId}/available-badges`,
      { params: options },
    )
    return response.data.badges
  },

  async getBadgeCount(id: string): Promise<number> {
    const response = await http.get<{ count: number }>(`${BASE_URL}/${id}/badge-count`)
    return response.data.count
  },

  async getFiringStats(): Promise<ClientRuleFiringStatsRow[]> {
    const response = await http.get<{ rules: ClientRuleFiringStatsRow[] }>(`${BASE_URL}/stats`)
    return response.data.rules
  },

  async getFiringDetail(id: string, days: number): Promise<ClientRuleFiringDetail> {
    const response = await http.get<ClientRuleFiringDetail>(`${BASE_URL}/${id}/stats`, {
      params: { days },
    })
    return response.data
  },

  async getFiringOverview(days: number): Promise<ClientRuleFiringOverview> {
    const response = await http.get<ClientRuleFiringOverview>(`${BASE_URL}/overview`, {
      params: { days },
    })
    return response.data
  },

  async getFiringFeed(
    filters: RuleFiringFeedFilters,
    page: { cursor?: string; limit?: number } = {},
  ): Promise<ClientRuleFiringFeed> {
    const response = await http.get<ClientRuleFiringFeed>(`${BASE_URL}/feed`, {
      params: { ...filters, ...page },
    })
    return response.data
  },

  async getReconciliationStatus(): Promise<BadgeReconciliationStatus> {
    const response = await http.get<BadgeReconciliationStatus>(`${BASE_URL}/reconcile-badges/status`)
    return response.data
  },

  async triggerReconciliation(): Promise<void> {
    await http.post(`${BASE_URL}/reconcile-badges`)
  },
}

export interface BadgeReconciliationStatus {
  dirty: boolean
  lastRunAt: Date | null
}
