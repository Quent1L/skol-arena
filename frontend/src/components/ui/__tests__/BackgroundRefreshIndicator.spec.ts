import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import BackgroundRefreshIndicator from '../BackgroundRefreshIndicator.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'fr',
  messages: {
    fr: { backgroundRefresh: { refreshing: 'Actualisation…', updated: 'Mis à jour' } },
  },
})

function mountIndicator(props: { active: boolean; done: boolean }) {
  return mount(BackgroundRefreshIndicator, { props, global: { plugins: [i18n] } })
}

describe('BackgroundRefreshIndicator', () => {
  it('shows nothing while no refresh is announced', () => {
    const wrapper = mountIndicator({ active: false, done: false })

    expect(wrapper.find('.refresh-bar').exists()).toBe(false)
    expect(wrapper.find('.status-pill').exists()).toBe(false)
  })

  it('shows the bar and the running label during a refresh', () => {
    const wrapper = mountIndicator({ active: true, done: false })

    expect(wrapper.find('.refresh-bar').exists()).toBe(true)
    expect(wrapper.find('.status-pill').text()).toContain('Actualisation…')
  })

  it('drops the bar and confirms once the refresh has landed', () => {
    const wrapper = mountIndicator({ active: false, done: true })

    expect(wrapper.find('.refresh-bar').exists()).toBe(false)
    expect(wrapper.find('.status-pill').text()).toContain('Mis à jour')
  })
})
