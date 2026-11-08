import { vi } from 'vitest'
import { describeServiceContract } from '@/test-support/service-contract'

vi.mock('vue-i18n', async () => (await import('@/test-support/mock-modules')).i18nEchoMock())
vi.mock('@/config/ApiConfig', async () => (await import('@/test-support/mock-modules')).apiConfigMock())
const toastAdd = vi.fn()
vi.mock('@/composables/useAppToast', () => ({ useAppToast: () => ({ add: toastAdd }) }))
import { useInvitationService } from '../invitation.service'
import { invitationApi } from '../invitation.api'

describeServiceContract('useInvitationService', useInvitationService, [
  { name: 'generateCode', call: (s) => s.generateCode({} as never), api: invitationApi, method: 'generate' },
  { name: 'getAllCodes', call: (s) => s.getAllCodes(), api: invitationApi, method: 'getAll', result: [] },
  { name: 'validateCode', call: (s) => s.validateCode('ABC'), api: invitationApi, method: 'validate', args: ['ABC'], result: { valid: true } },
  { name: 'consumeCode', call: (s) => s.consumeCode('ABC'), api: invitationApi, method: 'consume', args: ['ABC'] },
  { name: 'deactivateCode', call: (s) => s.deactivateCode('i1'), api: invitationApi, method: 'deactivate', args: ['i1'] },
  { name: 'joinOrganization', call: (s) => s.joinOrganization('ABC'), api: invitationApi, method: 'joinOrganization', args: ['ABC'] },
], toastAdd)
