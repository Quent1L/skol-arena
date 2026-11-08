import { describe, expect, it, vi } from 'vitest'
import { describeServiceContract } from '@/test-support/service-contract'

vi.mock('vue-i18n', async () => (await import('@/test-support/mock-modules')).i18nEchoMock())
vi.mock('@/config/ApiConfig', async () =>
  (await import('@/test-support/mock-modules')).apiConfigMock(),
)
const toastAdd = vi.fn()
vi.mock('@/composables/useAppToast', () => ({ useAppToast: () => ({ add: toastAdd }) }))
import { useBracketService } from '../bracket.service'
import { bracketApi } from '../bracket.api'

describe('useBracketService', () => {
  describeServiceContract(
    'useBracketService',
    useBracketService,
    [
      {
        name: 'loadBracket',
        call: (s) => s.loadBracket('t1'),
        api: bracketApi,
        method: 'getBracket',
        args: ['t1'],
        result: { rounds: [] },
      },
      {
        name: 'checkCanGenerate',
        call: (s) => s.checkCanGenerate('t1'),
        api: bracketApi,
        method: 'canGenerate',
        args: ['t1'],
        result: { canGenerate: true },
      },
      {
        name: 'generateBracket',
        call: (s) => s.generateBracket('t1', {} as never),
        api: bracketApi,
        method: 'generate',
        args: ['t1', {}],
        result: { rounds: [] },
      },
      {
        name: 'deleteBracket',
        call: (s) => s.deleteBracket('t1'),
        api: bracketApi,
        method: 'deleteBracket',
        args: ['t1'],
      },
    ],
    toastAdd,
  )

  it('starts idle, with no request in flight', () => {
    expect(useBracketService().loading?.value ?? false).toBe(false)
  })
})
