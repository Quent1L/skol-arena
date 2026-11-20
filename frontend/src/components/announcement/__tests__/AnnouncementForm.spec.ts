import { describe, it, expect, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { mountWithUi } from '@/test-support/mount'
import AnnouncementForm from '../AnnouncementForm.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  missingWarn: false,
  fallbackWarn: false,
  messages: { en: {} },
})

let mounted: ReturnType<typeof mountWithUi> | null = null

function mountForm(props: Record<string, unknown>) {
  mounted = mountWithUi(AnnouncementForm, { props, global: { plugins: [i18n] } })
  return mounted
}

afterEach(() => {
  mounted?.unmount()
  mounted = null
})

async function fillAndSubmit(wrapper: ReturnType<typeof mountForm>) {
  await wrapper.find('input[maxlength="200"]').setValue('Three new badges')
  await wrapper.find('textarea').setValue('Go and earn them!')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await flushPromises()
}

describe('AnnouncementForm', () => {
  it('hides the audience choice from a tournament organizer and targets their tournament', async () => {
    const wrapper = mountForm({ tournamentId: '00000000-0000-4000-8000-000000000001' })

    expect(wrapper.find('[data-testid="announcement-audience"]').exists()).toBe(false)

    await fillAndSubmit(wrapper)

    const submitted = wrapper.findComponent(AnnouncementForm).emitted('submit')
    expect(submitted?.[0]?.[0]).toEqual({
      title: 'Three new badges',
      body: 'Go and earn them!',
      audience: 'tournament',
      tournamentId: '00000000-0000-4000-8000-000000000001',
      inFeed: true,
      asPopup: true,
      expiresAt: null,
    })
  })

  it('lets a super admin address the whole app by default', async () => {
    const wrapper = mountForm({ allowGlobal: true })

    expect(wrapper.find('[data-testid="announcement-audience"]').exists()).toBe(true)

    await fillAndSubmit(wrapper)

    const submitted = wrapper.findComponent(AnnouncementForm).emitted('submit')
    expect(submitted?.[0]?.[0]).toMatchObject({ audience: 'all', tournamentId: null })
  })
})
