import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MatchFormSkeleton from '../MatchFormSkeleton.vue'

function mountSkeleton(variant: 'mobile' | 'desktop') {
  return mount(MatchFormSkeleton, {
    props: { variant },
    global: { stubs: { Skeleton: { template: '<div class="p-skeleton" />' } } },
  })
}

describe('MatchFormSkeleton', () => {
  it('draws the mobile chrome with the fixed action bar', () => {
    const wrapper = mountSkeleton('mobile')

    expect(wrapper.find('.sk-action-bar').exists()).toBe(true)
    expect(wrapper.findAll('.p-skeleton').length).toBeGreaterThan(0)
  })

  it('draws the desktop chrome without the mobile action bar', () => {
    const wrapper = mountSkeleton('desktop')

    expect(wrapper.find('.sk-action-bar').exists()).toBe(false)
    expect(wrapper.find('.max-w-2xl').exists()).toBe(true)
    expect(wrapper.findAll('.p-skeleton').length).toBeGreaterThan(0)
  })

  it('mirrors the step track of the shortest wizard in both variants', () => {
    // 3 dots, so 2 connecting rules between them.
    for (const variant of ['mobile', 'desktop'] as const) {
      const wrapper = mountSkeleton(variant)
      expect(wrapper.findAll('.flex-none\\!')).toHaveLength(3)
    }
  })

  it('carries the shared brand sweep', () => {
    expect(mountSkeleton('desktop').find('.sk-shimmer').exists()).toBe(true)
  })
})
