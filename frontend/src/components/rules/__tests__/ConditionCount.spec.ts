import { describe, it, expect, vi } from 'vitest'
import { h, reactive, ref } from 'vue'
import { mountWithUi } from '@/test-support/mount'
import { emptyCount, type BuilderNode } from '../condition-tree'
import ConditionCount from '../ConditionCount.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: ref('fr') }),
  createI18n: () => ({ global: { t: (key: string) => key }, install: () => {} }),
}))

type Count = Extract<BuilderNode, { kind: 'count' }>

function mountCount() {
  const node = reactive(emptyCount() as Count)
  const wrapper = mountWithUi(ConditionCount, {
    props: { modelValue: node },
    slots: { default: () => h('div', { 'data-test': 'where' }, 'sub-conditions') },
  })
  return { wrapper, node }
}

describe('ConditionCount', () => {
  it('renders the sub-conditions slot between its header and its comparison', () => {
    const { wrapper } = mountCount()
    expect(wrapper.text()).toContain('conditionCount.title')
    expect(wrapper.find('[data-test="where"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('conditionCount.comparison')
  })

  it('emits remove from its delete button', async () => {
    const { wrapper } = mountCount()
    await wrapper.find('button[aria-label="common.delete"]').trigger('click')
    expect(wrapper.findComponent(ConditionCount).emitted('remove')).toHaveLength(1)
  })
})
