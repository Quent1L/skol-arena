import { describe, it, expect } from 'vitest'
import { createI18n } from 'vue-i18n'
import fr from '@/i18n/messages/fr.json'
import type { MatchVotes } from '@skol-arena/shared/types/index'
import { mountWithUi } from '@/test-support/mount'
import FairPlaySection from '../FairPlaySection.vue'
import { playersById } from '../vote-players'

const players = playersById([
  { players: [{ id: 'p1', displayName: 'Paul', shortName: 'PA' }, { id: 'p2', displayName: 'Julie', shortName: 'JU' }] },
])

function votes(over: Partial<NonNullable<MatchVotes['fairPlay']>> = {}, isOpen = true) {
  return {
    matchId: 'm1',
    closesAt: new Date('2026-11-20T18:40:00Z'),
    isOpen,
    role: 'player' as const,
    fairPlay: { opponentIds: ['p1', 'p2'], myVotes: [], ...over },
    mvp: null,
  }
}

function mountSection(props: { votes: ReturnType<typeof votes> }) {
  const i18n = createI18n({ legacy: false, locale: 'fr', fallbackLocale: 'fr', messages: { fr } })
  const wrapper = mountWithUi(FairPlaySection, {
    props: { ...props, players, saving: false },
    global: { plugins: [i18n] },
  })
  return { wrapper, section: () => wrapper.findComponent(FairPlaySection) }
}

describe('FairPlaySection', () => {
  it('casts on tap and withdraws on a second tap', async () => {
    const { wrapper, section } = mountSection({ votes: votes() })
    await wrapper.get('[data-testid="fair-play-row-p1"] [data-testid="fair-play-up"]').trigger('click')
    expect(section().emitted('cast')?.[0]).toEqual(['p1', 'up', []])

    const { wrapper: voted, section: votedSection } = mountSection({
      votes: votes({ myVotes: [{ targetId: 'p1', value: 'up', tags: [] }] }),
    })
    await voted.get('[data-testid="fair-play-row-p1"] [data-testid="fair-play-up"]').trigger('click')
    expect(votedSection().emitted('remove')?.[0]).toEqual(['p1'])
  })

  it('offers the tags only under a 👎 and toggles them', async () => {
    const { wrapper, section } = mountSection({
      votes: votes({ myVotes: [{ targetId: 'p1', value: 'down', tags: ['attitude'] }] }),
    })
    const row = wrapper.get('[data-testid="fair-play-row-p1"]')
    expect(wrapper.find('[data-testid="fair-play-row-p2"] [data-testid="fair-play-tag-other"]').exists()).toBe(false)
    await row.get('[data-testid="fair-play-tag-other"]').trigger('click')
    expect(section().emitted('cast')?.[0]).toEqual(['p1', 'down', ['attitude', 'other']])
    await row.get('[data-testid="fair-play-tag-attitude"]').trigger('click')
    expect(section().emitted('cast')?.[1]).toEqual(['p1', 'down', []])
  })

  it('shows the team shortcut with two opponents or more', () => {
    const { wrapper } = mountSection({ votes: votes() })
    expect(wrapper.find('[data-testid="fair-play-team-up"]').exists()).toBe(true)
    const { wrapper: single } = mountSection({ votes: votes({ opponentIds: ['p1'] }) })
    expect(single.find('[data-testid="fair-play-team-up"]').exists()).toBe(false)
  })

  it('collapses to "Vote clos" once closed without a vote', () => {
    const { wrapper } = mountSection({ votes: votes({}, false) })
    expect(wrapper.text()).toContain('Vote clos')
    expect(wrapper.find('[data-testid="fair-play-up"]').exists()).toBe(false)
  })
})
