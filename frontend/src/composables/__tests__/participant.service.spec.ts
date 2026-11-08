import { vi } from 'vitest'
import { describeServiceContract } from '@/test-support/service-contract'

vi.mock('vue-i18n', async () => (await import('@/test-support/mock-modules')).i18nEchoMock())
vi.mock('@/config/ApiConfig', async () => (await import('@/test-support/mock-modules')).apiConfigMock())
const toastAdd = vi.fn()
vi.mock('@/composables/useAppToast', () => ({ useAppToast: () => ({ add: toastAdd }) }))
import { useParticipantService } from '../participant.service'
import { participantApi } from '../participant.api'

describeServiceContract('useParticipantService', useParticipantService, [
  { name: 'getTournamentParticipants', call: (s) => s.getTournamentParticipants('t1'), api: participantApi, method: 'getTournamentParticipants', args: ['t1'], result: [] },
  { name: 'joinTournament', call: (s) => s.joinTournament('t1'), api: participantApi, method: 'joinTournament', args: ['t1'], result: { id: 'p' } },
  { name: 'leaveTournament', call: (s) => s.leaveTournament('t1'), api: participantApi, method: 'leaveTournament', args: ['t1'] },
  { name: 'adminAddParticipant', call: (s) => s.adminAddParticipant('t1', 'u1'), api: participantApi, method: 'adminAddParticipant', args: ['t1', 'u1'], result: { id: 'p' } },
], toastAdd)
