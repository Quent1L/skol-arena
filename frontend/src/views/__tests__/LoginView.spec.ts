import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mountWithUi } from '@/test-support/mount'
import LoginView from '@/views/LoginView.vue'
import type { AppConfig } from '@skol-arena/shared/types/index'

const login = vi.fn()
const config = ref<Partial<AppConfig> | null>(null)

vi.mock('vue-i18n', async () => (await import('@/test-support/mock-modules')).i18nEchoMock())
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useRoute: () => ({ query: {} }),
}))
vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({ login, loading: ref(false), error: ref(null) }),
}))
vi.mock('@/composables/config/config.service', () => ({ useConfigService: () => ({ config }) }))
vi.mock('@/lib/auth-client', () => ({ authClient: { signIn: { oauth2: vi.fn() } } }))

describe('LoginView', () => {
  it('hides the demo banner outside a demo instance', () => {
    config.value = { demo: null }
    const wrapper = mountWithUi(LoginView)
    expect(wrapper.find('[data-testid="demo-credentials"]').exists()).toBe(false)
  })

  it('shows the demo sign-in and signs in with it in one click', async () => {
    config.value = { demo: { email: 'alex@skol.demo', password: 'SkolDemo123!' } }
    const wrapper = mountWithUi(LoginView)
    const banner = wrapper.find('[data-testid="demo-credentials"]')
    expect(banner.text()).toContain('alex@skol.demo')
    expect(banner.text()).toContain('SkolDemo123!')

    await banner.find('button').trigger('click')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(login).toHaveBeenCalledWith({ email: 'alex@skol.demo', password: 'SkolDemo123!' })
  })
})
