import { describe, vi } from 'vitest'
import { describeServiceContract } from '@/test-support/service-contract'

vi.mock('vue-i18n', async () => (await import('@/test-support/mock-modules')).i18nEchoMock())
vi.mock('@/config/ApiConfig', async () =>
  (await import('@/test-support/mock-modules')).apiConfigMock(),
)
const toastAdd = vi.fn()
vi.mock('@/composables/useAppToast', () => ({ useAppToast: () => ({ add: toastAdd }) }))
import { useTeamService } from '../team.service'
import { teamApi } from '../team.api'

describe('useTeamService', () => {
  describeServiceContract(
    'useTeamService',
    useTeamService,
    [
      {
        name: 'loadTeams',
        call: (s) => s.loadTeams('t1'),
        api: teamApi,
        method: 'list',
        args: ['t1'],
        result: [],
      },
      {
        name: 'createTeam',
        call: (s) => s.createTeam('t1', 'Reds'),
        api: teamApi,
        method: 'create',
        args: ['t1', { name: 'Reds' }],
        result: { id: 'x' },
      },
      {
        name: 'deleteTeam',
        call: (s) => s.deleteTeam('t1', 'x'),
        api: teamApi,
        method: 'delete',
        args: ['t1', 'x'],
      },
      {
        name: 'joinTeam',
        call: (s) => s.joinTeam('t1', 'x', 'u1'),
        api: teamApi,
        method: 'join',
        args: ['t1', 'x', 'u1'],
        result: { id: 'x' },
      },
      {
        name: 'leaveTeam',
        call: (s) => s.leaveTeam('t1', 'x'),
        api: teamApi,
        method: 'leave',
        args: ['t1', 'x'],
        result: { id: 'x' },
      },
    ],
    toastAdd,
  )
})
