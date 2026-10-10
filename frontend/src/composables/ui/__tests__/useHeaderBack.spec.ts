import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { resolveBackTarget, useHeaderBack, useHeaderBackOverride } from '../useHeaderBack'

const Empty = { template: '<div />' }

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'tournaments', component: Empty },
      { path: '/login', name: 'login', component: Empty },
      {
        path: '/tournaments/:id',
        component: Empty,
        children: [
          { path: '', name: 'tournament-detail', component: Empty },
          { path: ':tab', name: 'tournament-tab', component: Empty },
        ],
      },
      { path: '/tournaments/:tournamentId/create-match', name: 'create-match', component: Empty },
      { path: '/matches/:id', name: 'match-detail', component: Empty },
      { path: '/admin/users', name: 'admin-users', component: Empty },
    ],
  })
}

async function at(url: string, previous: string | null = null) {
  const router = makeRouter()
  await router.push(url)
  await router.isReady()
  window.history.replaceState({ back: previous }, '')
  vi.spyOn(router, 'back').mockImplementation(() => {})
  vi.spyOn(router, 'push')

  let api!: ReturnType<typeof useHeaderBack>
  const Host = defineComponent({
    setup() {
      api = useHeaderBack()
      return () => h('div')
    },
  })
  mount(Host, { global: { plugins: [router] } })
  return { api, router: router as Router }
}

afterEach(() => {
  window.history.replaceState(null, '')
  vi.restoreAllMocks()
})

describe('resolveBackTarget', () => {
  it('hides the button on entry points and in admin', async () => {
    const router = makeRouter()
    for (const url of ['/', '/login', '/admin/users']) {
      await router.push(url)
      expect(resolveBackTarget(router.currentRoute.value)).toBeNull()
    }
  })

  it('leads a tournament sub-page back to the infos tab', async () => {
    const router = makeRouter()
    await router.push('/tournaments/t1/participants')
    expect(resolveBackTarget(router.currentRoute.value)).toEqual({
      name: 'tournament-tab',
      params: { id: 't1', tab: 'infos' },
    })
  })

  it('leads a bottom-nav tab back to the list', async () => {
    const router = makeRouter()
    await router.push('/tournaments/t1/matches')
    expect(resolveBackTarget(router.currentRoute.value)).toBe('/')
  })

  it('leads the match form back to its tournament', async () => {
    const router = makeRouter()
    await router.push('/tournaments/t1/create-match')
    expect(resolveBackTarget(router.currentRoute.value)).toBe('/tournaments/t1')
  })
})

describe('useHeaderBack', () => {
  it('follows the history on an ordinary screen', async () => {
    const { api, router } = await at('/matches/m1', '/players/p1')
    api.goBack()
    expect(router.back).toHaveBeenCalledOnce()
  })

  it('falls back to the parent when opened cold', async () => {
    const { api, router } = await at('/matches/m1')
    api.goBack()
    expect(router.push).toHaveBeenCalledWith('/')
    expect(router.back).not.toHaveBeenCalled()
  })

  it('goes up from a tournament tab even when the history holds another tab', async () => {
    const { api, router } = await at('/tournaments/t1/matches', '/tournaments/t1/stats')
    api.goBack()
    expect(router.push).toHaveBeenCalledWith('/')
    expect(router.back).not.toHaveBeenCalled()
  })

  it('pops the history when it already holds the infos tab', async () => {
    const { api, router } = await at('/tournaments/t1/participants', '/tournaments/t1/infos')
    api.goBack()
    expect(router.back).toHaveBeenCalledOnce()
  })

  it('opens the infos tab by name, never the bare tournament url', async () => {
    const { api, router } = await at('/tournaments/t1/participants', '/tournaments/t1/standings')
    api.goBack()
    expect(router.push).toHaveBeenCalledWith({
      name: 'tournament-tab',
      params: { id: 't1', tab: 'infos' },
    })
  })

  it('lets the mounted screen take over', async () => {
    const handler = vi.fn(() => true)
    const router = makeRouter()
    await router.push('/tournaments/t1/create-match')
    vi.spyOn(router, 'back').mockImplementation(() => {})
    let api!: ReturnType<typeof useHeaderBack>
    const Host = defineComponent({
      setup() {
        api = useHeaderBack()
        useHeaderBackOverride(handler)
        return () => h('div')
      },
    })
    const wrapper = mount(Host, { global: { plugins: [router] } })
    await flushPromises()

    api.goBack()
    expect(handler).toHaveBeenCalledOnce()
    expect(router.back).not.toHaveBeenCalled()

    wrapper.unmount()
    api.goBack()
    expect(handler).toHaveBeenCalledOnce()
  })
})
