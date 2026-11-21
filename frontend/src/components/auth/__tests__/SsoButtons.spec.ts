import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountWithUi } from '@/test-support/mount'
import SsoButtons from '../SsoButtons.vue'

vi.mock('vue-i18n', async () => (await import('@/test-support/mock-modules')).i18nEchoMock())

const social = vi.fn()
vi.mock('@/lib/auth-client', () => ({
  authClient: { signIn: { social: (...a: unknown[]) => social(...a) } },
}))

const PROVIDERS = [
  { id: 'keycloak', label: 'Okteo' },
  { id: 'authentik', label: null },
]

function mount(props: Record<string, unknown> = {}) {
  return mountWithUi(SsoButtons, { props: { providers: PROVIDERS, ...props } })
}

describe('SsoButtons', () => {
  beforeEach(() => {
    social.mockReset()
    social.mockResolvedValue({ data: { redirect: true }, error: null })
  })

  it('renders one button per provider, the operator label first', () => {
    const labels = mount()
      .findAll('button')
      .map((button) => button.text())
    expect(labels).toEqual(['Okteo', 'auth.sso.signIn'])
  })

  it('starts the social sign-in of the clicked provider', async () => {
    const wrapper = mount()
    await wrapper.findAll('button')[1]!.trigger('click')
    expect(social).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'authentik', requestSignUp: undefined }),
    )
  })

  it('asks for a sign-up and runs prepare first in the sign-up flow', async () => {
    const prepare = vi.fn()
    const wrapper = mount({ signUp: true, prepare })
    await wrapper.findAll('button')[0]!.trigger('click')
    expect(prepare).toHaveBeenCalledBefore(social)
    expect(social).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'keycloak', requestSignUp: true }),
    )
  })

  it('reports an error answered by Better Auth', async () => {
    social.mockResolvedValue({ data: null, error: { message: 'provider not found' } })
    const wrapper = mount()
    await wrapper.findAll('button')[0]!.trigger('click')
    await flushPromises()
    expect(wrapper.findComponent(SsoButtons).emitted('error')).toEqual([['provider not found']])
  })
})
