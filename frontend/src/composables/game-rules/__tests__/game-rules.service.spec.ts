import { describe, vi } from 'vitest'
import { describeServiceContract } from '@/test-support/service-contract'

vi.mock('vue-i18n', async () => (await import('@/test-support/mock-modules')).i18nEchoMock())
vi.mock('@/config/ApiConfig', async () =>
  (await import('@/test-support/mock-modules')).apiConfigMock(),
)
const toastAdd = vi.fn()
vi.mock('@/composables/useAppToast', () => ({ useAppToast: () => ({ add: toastAdd }) }))
import { useGameRulesService } from '../game-rules.service'
import { gameRulesApi } from '../game-rules.api'

describe('useGameRulesService', () => {
  describeServiceContract(
    'useGameRulesService',
    useGameRulesService,
    [
      {
        name: 'loadRules',
        call: (s) => s.loadRules(),
        api: gameRulesApi,
        method: 'list',
        result: [],
      },
      {
        name: 'loadRuleById',
        call: (s) => s.loadRuleById('r1'),
        api: gameRulesApi,
        method: 'getById',
        args: ['r1'],
        result: { id: 'r1' },
      },
      {
        name: 'createRule',
        call: (s) => s.createRule({} as never),
        api: gameRulesApi,
        method: 'create',
        result: { id: 'r1' },
      },
      {
        name: 'updateRule',
        call: (s) => s.updateRule('r1', {} as never),
        api: gameRulesApi,
        method: 'update',
        result: { id: 'r1' },
      },
      {
        name: 'deleteRule',
        call: (s) => s.deleteRule('r1'),
        api: gameRulesApi,
        method: 'delete',
        args: ['r1'],
      },
    ],
    toastAdd,
  )
})
