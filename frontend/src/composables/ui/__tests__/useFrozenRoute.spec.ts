import { describe, expect, it } from 'vitest'
import { KeepAlive, defineComponent, h, watchEffect } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { RouterView, createMemoryHistory, createRouter, useRoute } from 'vue-router'
import { useFrozenRoute } from '../useFrozenRoute'

// Every route a tab instance has read, prefixed with the instance number.
const seen: string[] = []
let instances = 0

const Tab = defineComponent({
  setup() {
    const n = instances++
    const route = useRoute()
    watchEffect(() => seen.push(`${n}:${route.params.id}/${route.params.tab}`))
    return () => h('p', `tab ${route.params.tab}`)
  },
})
const Tournament = defineComponent({
  name: 'TournamentDetailView',
  setup() {
    useFrozenRoute()
    return () => h(RouterView)
  },
})
const Match = defineComponent({ render: () => h('div', 'match') })

function setup() {
  seen.length = 0
  instances = 0
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/tournaments/:id', component: Tournament, children: [{ path: ':tab', component: Tab }] },
      { path: '/matches/:id', component: Match },
    ],
  })
  const App = defineComponent({
    setup: () => () =>
      h(RouterView, null, {
        default: ({ Component, route }: { Component: unknown; route: { path: string; params: { id?: string } } }) =>
          h(KeepAlive, { include: 'TournamentDetailView' }, [
            h(Component as never, { key: route.path.startsWith('/tournaments/') ? `t-${route.params.id}` : route.path }),
          ]),
      }),
  })
  const wrapper = mount(App, { global: { plugins: [router] } })
  return { router, wrapper }
}

describe('useFrozenRoute', () => {
  it('keeps the hidden tab on its tournament route while a match page is shown', async () => {
    const { router, wrapper } = setup()
    await router.push('/tournaments/t1/standings')
    await flushPromises()

    await router.push('/matches/m1')
    await flushPromises()
    expect(seen).toEqual(['0:t1/standings'])

    await router.back()
    await flushPromises()
    expect(wrapper.text()).toBe('tab standings')
    expect(instances).toBe(1)
  })

  it('follows tab changes on its own tournament', async () => {
    const { router, wrapper } = setup()
    await router.push('/tournaments/t1/standings')
    await flushPromises()
    await router.push('/tournaments/t1/matches')
    await flushPromises()
    expect(wrapper.text()).toBe('tab matches')
  })

  it('never lets a cached tournament read another tournament', async () => {
    const { router } = setup()
    await router.push('/tournaments/t1/standings')
    await flushPromises()
    await router.push('/tournaments/t2/stats')
    await flushPromises()
    expect(seen.filter((entry) => entry.startsWith('0:'))).toEqual(['0:t1/standings'])
  })
})
