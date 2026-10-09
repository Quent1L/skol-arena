import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountWithPrime } from '@/test-support/mount'
import SettingsView from '@/views/SettingsView.vue'
import { useAuth } from '@/composables/useAuth'
import { userApi } from '@/composables/user/user.api'
import { makeAuthMock, type AuthMockState } from '@/test-support/mock-modules'

vi.mock('vue-i18n', async () => (await import('@/test-support/mock-modules')).i18nEchoMock())
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }))
vi.mock('@/composables/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('@/composables/user/user.api', () => ({ userApi: { me: vi.fn(), updateProfile: vi.fn() } }))
vi.mock('@/composables/notification/notification.push', () => ({
  useNotificationPush: () => ({ enablePush: vi.fn(), disablePush: vi.fn() }),
}))
vi.mock('@/composables/pwa/pwa.install', () => ({
  usePWAInstall: () => ({
    isInstalled: { value: false },
    isIOS: { value: false },
    canInstall: { value: false },
    showIOSInstructions: { value: false },
    triggerInstall: vi.fn(),
  }),
}))
vi.mock('@/composables/invitation/invitation.service', () => ({
  useInvitationService: () => ({ joinOrganization: vi.fn(), validateCode: vi.fn() }),
}))

const state: AuthMockState = {
  user: { id: 'u1', email: 'sso@example.com' },
  role: 'player',
  initialized: true,
}

function mountWith(providers: string[]) {
  const auth = makeAuthMock(state)
  auth.listAuthProviders = vi.fn(async () => providers)
  vi.mocked(useAuth).mockReturnValue(auth as never)
  return { auth, wrapper: mountWithPrime(SettingsView, { global: { stubs: { AvatarEditor: true } } }) }
}

describe('SettingsView account section', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(userApi.me).mockResolvedValue({
      id: 'u1',
      displayName: 'Alice',
      shortName: 'ALI',
      betterAuth: { email: 'sso@example.com' },
    } as never)
  })

  it('offers the change-password flow when a native password exists', async () => {
    const { wrapper } = mountWith(['credential'])
    await flushPromises()

    expect(wrapper.text()).toContain('settings.account.changePassword')
    expect(wrapper.text()).not.toContain('settings.account.ssoOnlyNotice')
  })

  it('replaces it with the email flow for an SSO-only account', async () => {
    const { wrapper } = mountWith(['keycloak'])
    await flushPromises()

    expect(wrapper.text()).toContain('settings.account.ssoOnlyNotice')
    expect(wrapper.text()).toContain('settings.account.setPassword')
    expect(wrapper.text()).not.toContain('settings.account.changePassword')
  })

  it('mails a reset link to the signed-in address', async () => {
    const { auth, wrapper } = mountWith(['keycloak'])
    await flushPromises()

    const button = wrapper.findAll('button').find((b) => b.text().includes('setPassword'))
    await button?.trigger('click')
    await flushPromises()

    expect(auth.requestPasswordReset).toHaveBeenCalledWith('sso@example.com')
    expect(wrapper.text()).toContain('settings.account.setPasswordSent')
  })

  it('keeps the change-password flow when the provider lookup fails', async () => {
    const auth = makeAuthMock(state)
    auth.listAuthProviders = vi.fn(async () => {
      throw new Error('offline')
    })
    vi.mocked(useAuth).mockReturnValue(auth as never)

    const wrapper = mountWithPrime(SettingsView, { global: { stubs: { AvatarEditor: true } } })
    await flushPromises()

    expect(wrapper.text()).toContain('settings.account.changePassword')
  })
})
