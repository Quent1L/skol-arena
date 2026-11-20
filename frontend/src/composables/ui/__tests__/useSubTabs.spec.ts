import { describe, it, expect } from 'vitest'
import { defineComponent, h, nextTick, ref, type Ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { subTabWindow, useSubTabs, type SubTabOption } from '../useSubTabs'

type Value = 'profile' | 'global'

const BOTH: SubTabOption<Value>[] = [
  { value: 'profile', label: 'Profile' },
  { value: 'global', label: 'Global' },
]

async function mountSubTabs(
  url = '/tournaments/1',
  options: Ref<SubTabOption<Value>[]> = ref(BOTH),
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
  await router.push(url)
  await router.isReady()

  let api!: ReturnType<typeof useSubTabs<Value>>
  const Host = defineComponent({
    setup() {
      api = useSubTabs<Value>({ options, queryKey: 'statsSub' })
      return () => h('div')
    },
  })
  mount(Host, { global: { plugins: [router] } })

  return { api, router: router as Router, options }
}

describe('useSubTabs', () => {
  it('starts on the first option', async () => {
    const { api } = await mountSubTabs()
    expect(api.active.value).toBe('profile')
    expect(api.activeIndex.value).toBe(0)
  })

  it('restores the value carried by the URL', async () => {
    const { api } = await mountSubTabs('/tournaments/1?statsSub=global')
    expect(api.active.value).toBe('global')
  })

  // The offered views depend on props: the URL can name a view absent here.
  it('ignores a value that is not part of the options', async () => {
    const { api } = await mountSubTabs('/tournaments/1?statsSub=peak')
    expect(api.active.value).toBe('profile')
  })

  it('writes the view to the URL, and removes the param for the default view', async () => {
    const { api, router } = await mountSubTabs('/tournaments/1?tab=stats')

    api.setActive('global')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ tab: 'stats', statsSub: 'global' })

    api.setActive('profile')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ tab: 'stats' })
  })

  // A season that ends loses its provisional view: the active one must not outlive it.
  it('falls back to the default when the active view disappears from the options', async () => {
    const options = ref(BOTH)
    const { api } = await mountSubTabs('/tournaments/1?statsSub=global', options)
    expect(api.active.value).toBe('global')

    options.value = [BOTH[0]!]
    await nextTick()
    expect(api.active.value).toBe('profile')
  })

  it('with no router, the view stays local', () => {
    let api!: ReturnType<typeof useSubTabs<Value>>
    const Host = defineComponent({
      setup() {
        api = useSubTabs<Value>({ options: ref(BOTH), queryKey: 'statsSub' })
        return () => h('div')
      },
    })
    mount(Host)

    api.setActive('global')
    expect(api.active.value).toBe('global')
  })
})

describe('subTabWindow', () => {
  it('covers the immediate neighbors, without overflowing', () => {
    expect(subTabWindow(0, 4, 1)).toEqual([0, 1])
    expect(subTabWindow(2, 4, 1)).toEqual([1, 2, 3])
    expect(subTabWindow(3, 4, 1)).toEqual([2, 3])
  })

  it('a zero radius mounts only the active view', () => {
    expect(subTabWindow(1, 3, 0)).toEqual([1])
  })
})
