import { describe, it, expect, vi } from 'vitest'
import { mountWithPrime } from '@/test-support/mount'
import FontAwesomeIconPicker from '@/components/forms/FontAwesomeIconPicker.vue'

vi.mock('vue-i18n', async () => (await import('@/test-support/mock-modules')).i18nEchoMock())

// The real Dialog teleports to body; render its content inline instead.
const DialogStub = { template: '<div><slot /><slot name="footer" /></div>' }

function mountPicker(modelValue = '') {
  return mountWithPrime(FontAwesomeIconPicker, {
    props: { modelValue },
    global: { stubs: { Dialog: DialogStub } },
  })
}

describe('FontAwesomeIconPicker', () => {
  it('finds Iconify discipline icons by a French search term', async () => {
    const wrapper = mountPicker()
    await wrapper.find('input').setValue('babyfoot')

    const option = wrapper.find('button[title="Table football"]')
    expect(option.exists()).toBe(true)
    expect(option.find('i').classes()).toEqual(
      expect.arrayContaining(['icf', 'icf-game-icons--babyfoot-players']),
    )
  })

  it('emits the Iconify class string on selection, like a Font Awesome one', async () => {
    const wrapper = mountPicker()
    await wrapper.find('input').setValue('billard')
    await wrapper.find('button[title="Billiards"]').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['icf icf-mdi--billiards'])
  })

  it('still lists and labels Font Awesome icons', async () => {
    const wrapper = mountPicker('fas fa-trophy')
    expect(wrapper.text()).toContain('Trophy')

    await wrapper.find('input').setValue('trophy')
    expect(wrapper.find('button[title="Trophy"] i').classes()).toEqual(['fas', 'fa-trophy', 'text-xl'])
  })

  it('shows Iconify categories as tabs', () => {
    const wrapper = mountPicker()
    const tabs = wrapper.findAll('button.px-2').map((b) => b.text())
    expect(tabs).toEqual(expect.arrayContaining(['Bar + Table games', 'Ball + Racket sports']))
  })
})
