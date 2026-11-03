import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mountWithUi } from '@/test-support/mount'
import USelect from '@nuxt/ui/components/Select.vue'
import LocaleSwitcher from '@/components/LocaleSwitcher.vue'
import { i18n, LOCALE_STORAGE_KEY } from '@/i18n'

describe('LocaleSwitcher', () => {
  afterEach(() => {
    i18n.global.locale.value = 'fr'
    localStorage.removeItem(LOCALE_STORAGE_KEY)
  })

  it('switches the app language and remembers it', async () => {
    i18n.global.locale.value = 'fr'
    const wrapper = mountWithUi(LocaleSwitcher, { global: { plugins: [i18n] } })

    wrapper.findComponent(USelect).vm.$emit('update:modelValue', 'en')
    await nextTick()

    expect(i18n.global.locale.value).toBe('en')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
    expect(document.documentElement.lang).toBe('en')
  })
})
