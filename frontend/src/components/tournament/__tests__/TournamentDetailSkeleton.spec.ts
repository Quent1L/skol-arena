import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TournamentDetailSkeleton from '../TournamentDetailSkeleton.vue'
import TournamentTabSkeleton from '../TournamentTabSkeleton.vue'

function mountSkeleton(variant: 'mobile' | 'desktop', tab?: string) {
  return mount(TournamentDetailSkeleton, {
    props: { variant, tab },
    global: { stubs: { Skeleton: { template: '<div class="p-skeleton" />' } } },
  })
}

function mountTab(tab: string | undefined, variant: 'mobile' | 'desktop' = 'mobile') {
  return mount(TournamentTabSkeleton, {
    props: { tab, variant },
    global: { stubs: { Skeleton: { template: '<div class="p-skeleton" />' } } },
  })
}

describe('TournamentDetailSkeleton', () => {
  it('draws the mobile chrome with the bottom nav', () => {
    const wrapper = mountSkeleton('mobile', 'infos')

    expect(wrapper.find('.sk-nav-bar').exists()).toBe(true)
    expect(wrapper.findComponent(TournamentTabSkeleton).props('tab')).toBe('infos')
  })

  it('swaps the bottom nav for a back bar on a mobile sub-page', () => {
    const wrapper = mountSkeleton('mobile', 'teams')

    expect(wrapper.find('.sk-nav-bar').exists()).toBe(false)
    expect(wrapper.find('.h-14').exists()).toBe(true)
  })

  it('renders the desktop chrome without the mobile nav', () => {
    const wrapper = mountSkeleton('desktop', 'matches')

    expect(wrapper.find('.sk-nav-bar').exists()).toBe(false)
    expect(wrapper.findComponent(TournamentTabSkeleton).props('variant')).toBe('desktop')
  })

  it('only draws the tournament header on the infos tab', () => {
    const infos = mountSkeleton('mobile', 'infos').findAll('.p-skeleton').length
    const matches = mountSkeleton('mobile', 'matches').findAll('.p-skeleton').length

    expect(infos).toBeGreaterThan(0)
    expect(matches).toBeGreaterThan(0)
    expect(mountSkeleton('mobile', 'matches').find('.rounded-full\\!').exists()).toBe(true)
  })
})

describe('TournamentTabSkeleton', () => {
  it('gives each tab its own shape', () => {
    // Match cards, not list rows: the two do not stack the same way.
    expect(mountTab('matches').find('.bg-slate-800').exists()).toBe(true)
    expect(mountTab('participants').findAll('.rounded-xl').length).toBe(6)
    expect(mountTab('standings').findAll('.rounded-2xl').length).toBe(2)
    expect(mountTab('bracket').findAll('.min-w-32').length).toBe(3)
  })

  it('falls back to standings while the view resolves its default tab', () => {
    expect(mountTab(undefined).findAll('.rounded-2xl').length).toBe(2)
  })

  it('widens the grid on desktop', () => {
    expect(mountTab('stats', 'desktop').find('.grid-cols-2').exists()).toBe(true)
    expect(mountTab('stats', 'mobile').find('.grid-cols-1').exists()).toBe(true)
  })
})
