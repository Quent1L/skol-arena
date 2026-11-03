import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mountWithUi } from '@/test-support/mount'
import ConditionPalette from '@/components/rules/ConditionPalette.vue'
import { i18n } from '@/i18n'

function labels(wrapper: ReturnType<typeof mountWithUi>): string[] {
  return wrapper.findAll('[data-palette-type]').map((block) => block.text())
}

describe('ConditionPalette', () => {
  afterEach(() => {
    i18n.global.locale.value = 'fr'
  })

  it('names its blocks in the current language', async () => {
    i18n.global.locale.value = 'en'
    const wrapper = mountWithUi(ConditionPalette, { global: { plugins: [i18n] } })
    expect(labels(wrapper)).toEqual(['Condition', 'AND group', 'OR group', 'Match counter'])

    i18n.global.locale.value = 'fr'
    await nextTick()
    expect(labels(wrapper)).toEqual(['Condition', 'Groupe ET', 'Groupe OU', 'Compteur de matchs'])
  })
})
