import { describe, it, expect, vi } from 'vitest'
import { describeServiceContract } from '@/test-support/service-contract'

vi.mock('vue-i18n', async () => (await import('@/test-support/mock-modules')).i18nEchoMock())
vi.mock('@/config/ApiConfig', async () => (await import('@/test-support/mock-modules')).apiConfigMock())
const toastAdd = vi.fn()
vi.mock('@/composables/useAppToast', () => ({ useAppToast: () => ({ add: toastAdd }) }))
import { useRulesService } from '../rules.service'
import { rulesApi } from '../rules.api'

const rule = { id: 'r1', conditions: null }
describeServiceContract('useRulesService', useRulesService, [
  { name: 'loadRules', call: (s) => s.loadRules(), api: rulesApi, method: 'list', result: [] },
  { name: 'loadRuleById', call: (s) => s.loadRuleById('r1'), api: rulesApi, method: 'getById', args: ['r1'], result: rule },
  { name: 'createRule', call: (s) => s.createRule({} as never), api: rulesApi, method: 'create', result: rule },
  { name: 'updateRule', call: (s) => s.updateRule('r1', {} as never), api: rulesApi, method: 'update', result: rule },
  { name: 'deleteRule', call: (s) => s.deleteRule('r1'), api: rulesApi, method: 'delete', args: ['r1'] },
  { name: 'loadCatalog', call: (s) => s.loadCatalog('match_submitted'), api: rulesApi, method: 'getCatalog', args: ['match_submitted'], result: [] },
  { name: 'loadFiringStats', call: (s) => s.loadFiringStats(), api: rulesApi, method: 'getFiringStats', result: [] },
  { name: 'loadFiringDetail', call: (s) => s.loadFiringDetail('r1'), api: rulesApi, method: 'getFiringDetail', args: ['r1', 30], result: {} },
  { name: 'triggerReconciliation', call: (s) => s.triggerReconciliation(), api: rulesApi, method: 'triggerReconciliation' },
], toastAdd)

describe('useRulesService.loadReconciliationStatus', () => {
  it('keeps the status and drops it to null when the endpoint fails', async () => {
    const service = useRulesService()
    vi.spyOn(rulesApi, 'getReconciliationStatus').mockResolvedValueOnce({ running: true } as never)
    await service.loadReconciliationStatus()
    expect(service.reconciliationStatus.value).toEqual({ running: true })

    vi.spyOn(rulesApi, 'getReconciliationStatus').mockRejectedValueOnce(new Error('down'))
    await service.loadReconciliationStatus()
    expect(service.reconciliationStatus.value).toBeNull()
  })
})
