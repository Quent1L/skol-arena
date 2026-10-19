import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { rulesApi, type BadgeReconciliationStatus, type CatalogFact, type RuleListFilters } from './rules.api'
import type {
  ClientRule,
  ClientRuleFiringDetail,
  ClientRuleFiringStatsRow,
  CreateRuleData,
  RuleAction,
  RuleConditions,
  TestRuleResult,
  UpdateRuleData,
} from '@skol-arena/shared/types/index'
import { restoreDateValue, restoreDateValues } from '@/components/rules/condition-tree'

/** Date condition values, as stored: see `restoreDateValues`. */
function withStoredDates(rule: ClientRule): ClientRule {
  return { ...rule, conditions: restoreDateValues(rule.conditions) }
}

export function useRulesService() {
  const { t } = useI18n()
  const rules = ref<ClientRule[]>([])
  const currentRule = ref<ClientRule | null>(null)
  const catalog = ref<CatalogFact[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function loadRules(filters: RuleListFilters = {}) {
    loading.value = true
    error.value = null
    try {
      rules.value = (await rulesApi.list(filters)).map(withStoredDates)
    } catch (err) {
      error.value = err instanceof Error ? err.message : t('rulesService.errors.listFailed')
    } finally {
      loading.value = false
    }
  }

  async function loadRuleById(id: string) {
    loading.value = true
    error.value = null
    try {
      currentRule.value = withStoredDates(await rulesApi.getById(id))
    } catch (err) {
      error.value = err instanceof Error ? err.message : t('rulesService.errors.getFailed')
    } finally {
      loading.value = false
    }
  }

  async function loadCatalog(triggerEvent: string) {
    try {
      const result = await rulesApi.getCatalog(triggerEvent)
      // The `matchDate` sample is a `YYYY-MM-DD` string the interceptor revived too.
      catalog.value = result.facts.map((f) => ({
        ...f,
        sample: restoreDateValue(f.sample),
      }))
    } catch (err) {
      error.value = err instanceof Error ? err.message : t('rulesService.errors.loadCatalogFailed')
    }
  }

  async function createRule(data: CreateRuleData): Promise<ClientRule | null> {
    loading.value = true
    error.value = null
    try {
      const rule = withStoredDates(await rulesApi.create(data))
      rules.value.unshift(rule)
      return rule
    } catch (err) {
      error.value = err instanceof Error ? err.message : t('rulesService.errors.createFailed')
      return null
    } finally {
      loading.value = false
    }
  }

  async function updateRule(id: string, data: UpdateRuleData): Promise<ClientRule | null> {
    loading.value = true
    error.value = null
    try {
      const updated = withStoredDates(await rulesApi.update(id, data))
      const idx = rules.value.findIndex((r) => r.id === id)
      if (idx !== -1) rules.value[idx] = updated
      currentRule.value = updated
      return updated
    } catch (err) {
      error.value = err instanceof Error ? err.message : t('rulesService.errors.updateFailed')
      return null
    } finally {
      loading.value = false
    }
  }

  async function deleteRule(id: string): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      await rulesApi.delete(id)
      rules.value = rules.value.filter((r) => r.id !== id)
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : t('rulesService.errors.deleteFailed')
      return false
    } finally {
      loading.value = false
    }
  }

  async function getBadgeCount(id: string): Promise<number> {
    try {
      return await rulesApi.getBadgeCount(id)
    } catch {
      return 0
    }
  }

  const firingStats = ref<ClientRuleFiringStatsRow[]>([])
  const firingDetail = ref<ClientRuleFiringDetail | null>(null)

  /** One call for the whole list — the counters are aggregated server-side. */
  async function loadFiringStats() {
    try {
      firingStats.value = await rulesApi.getFiringStats()
    } catch (err) {
      error.value = err instanceof Error ? err.message : t('rulesService.errors.statsFailed')
    }
  }

  async function loadFiringDetail(id: string, days = 30) {
    loading.value = true
    error.value = null
    try {
      firingDetail.value = await rulesApi.getFiringDetail(id, days)
    } catch (err) {
      error.value = err instanceof Error ? err.message : t('rulesService.errors.statsFailed')
      firingDetail.value = null
    } finally {
      loading.value = false
    }
  }

  const reconciliationStatus = ref<BadgeReconciliationStatus | null>(null)

  async function loadReconciliationStatus() {
    try {
      reconciliationStatus.value = await rulesApi.getReconciliationStatus()
    } catch {
      reconciliationStatus.value = null
    }
  }

  async function triggerReconciliation(): Promise<boolean> {
    try {
      await rulesApi.triggerReconciliation()
      await loadReconciliationStatus()
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : t('rulesService.errors.triggerReconciliationFailed')
      return false
    }
  }

  async function testRule(
    triggerEvent: string,
    conditions: RuleConditions,
    action: RuleAction,
    context: Record<string, unknown>,
  ): Promise<TestRuleResult | null> {
    try {
      return await rulesApi.test({ triggerEvent, conditions, action, context })
    } catch (err) {
      error.value = err instanceof Error ? err.message : t('rulesService.errors.testFailed')
      return null
    }
  }

  return {
    rules,
    currentRule,
    catalog,
    loading,
    error,
    loadRules,
    loadRuleById,
    loadCatalog,
    createRule,
    updateRule,
    deleteRule,
    getBadgeCount,
    firingStats,
    firingDetail,
    loadFiringStats,
    loadFiringDetail,
    reconciliationStatus,
    loadReconciliationStatus,
    triggerReconciliation,
    testRule,
  }
}
