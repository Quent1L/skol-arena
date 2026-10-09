import { describe, it, expect } from 'vitest'
import { RouterLinkStub } from '@vue/test-utils'
import { mountWithPlugins } from '@/test-support/mount'
import StatLeaderRow from '../StatLeaderRow.vue'

const THOMAS = { id: 'p1', displayName: 'Thomas', shortName: 'THO' }
const REMI = { id: 'p2', displayName: 'Rémi', shortName: 'REM' }

function mountRow(props: Record<string, unknown> = {}) {
  return mountWithPlugins(StatLeaderRow, {
    props: {
      players: [THOMAS],
      value: '82 %',
      subLabel: '20 matchs',
      barPct: 60,
      barClass: 'bg-emerald-500',
      ...props,
    },
  })
}

describe('StatLeaderRow', () => {
  it('shows an avatar, the name, the value and its sub-label', () => {
    const wrapper = mountRow()

    // The avatar is drawn from the initials, so the row reads without an image.
    expect(wrapper.text()).toContain('TH')
    expect(wrapper.text()).toContain('Thomas')
    expect(wrapper.text()).toContain('82 %')
    expect(wrapper.text()).toContain('20 matchs')
  })

  it('links the player to their profile, keeping the tournament context', () => {
    const wrapper = mountRow({ tournamentId: 't1' })

    expect(wrapper.findComponent(RouterLinkStub).props('to')).toEqual({
      path: '/players/p1',
      query: { tournamentId: 't1' },
    })
  })

  it('gives a team one link per player', () => {
    const wrapper = mountRow({ players: [THOMAS, REMI] })

    const links = wrapper.findAllComponents(RouterLinkStub)
    expect(links.map((link) => link.props('to').path)).toEqual(['/players/p1', '/players/p2'])
    expect(wrapper.text()).toContain('/')
  })

  it('drops the links when asked, for rows that are not players', () => {
    const wrapper = mountRow({ linkPlayers: false })

    expect(wrapper.findAllComponents(RouterLinkStub)).toHaveLength(0)
    expect(wrapper.text()).toContain('Thomas')
  })

  it('draws the bar at the given width, clamped to the track', () => {
    expect(mountRow({ barPct: 42.4 }).find('.h-full').attributes('style')).toContain('width: 42%')
    expect(mountRow({ barPct: 140 }).find('.h-full').attributes('style')).toContain('width: 100%')
    expect(mountRow({ barPct: -5 }).find('.h-full').attributes('style')).toContain('width: 0%')
  })

  it('shows the rank badge only when the board ranks anything', () => {
    expect(mountRow({ rank: 2 }).find('span.rounded-full').text()).toBe('2')
    expect(mountRow().find('span.rounded-full').exists()).toBe(false)
  })

  it('marks the tie only where the group starts', () => {
    const marked = mountRow({ rank: 1, tiedCount: 2, showTie: true, tieLabel: 'ex aequo' })
    expect(marked.find('[data-test="ex-aequo"]').text()).toContain('ex aequo (2)')

    const inGroup = mountRow({ rank: 1, tiedCount: 2, showTie: false, tieLabel: 'ex aequo' })
    expect(inGroup.find('[data-test="ex-aequo"]').exists()).toBe(false)
  })
})
