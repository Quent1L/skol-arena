import { describe, it, expect } from 'vitest'
import { createI18n } from 'vue-i18n'
import fr from '@/i18n/messages/fr.json'
import type { MatchVotes } from '@skol-arena/shared/types/index'
import { mountWithUi } from '@/test-support/mount'
import MvpSection from '../MvpSection.vue'
import { playersById } from '../vote-players'

const players = playersById([{ players: [{ id: 'p1', displayName: 'Paul', shortName: 'PA' }] }])
const i18n = createI18n({ legacy: false, locale: 'fr', fallbackLocale: 'fr', messages: { fr } })

function mountSection(closesAt: Date, isOpen = true) {
  const votes = {
    matchId: 'm1',
    closesAt,
    isOpen,
    role: 'player' as const,
    fairPlay: null,
    mvp: {
      spectatorsEnabled: true,
      candidateIds: ['p1'],
      myVote: null,
      mvpPlayerIds: ['p1'],
      spectatorCount: 0,
      blockedTargetIds: [],
    },
  } satisfies MatchVotes
  return mountWithUi(MvpSection, { props: { votes, players, saving: false }, global: { plugins: [i18n] } })
}

const inMinutes = (m: number) => new Date(Date.now() + m * 60_000 + 30_000)

describe('MvpSection', () => {
  it('names the MVP with the time left to vote', () => {
    const text = mountSection(inMinutes(28 * 60 + 5)).get('[data-testid="mvp-result"]').text()
    expect(text).toContain('🏅 Paul')
    expect(text).toContain('vote ouvert encore 1 j 4 h')
    expect(mountSection(inMinutes(65)).text()).toContain('1 h 5 min')
    expect(mountSection(inMinutes(12)).text()).toContain('12 min')
  })

  it('drops the time left once the vote is closed', () => {
    const wrapper = mountSection(inMinutes(-5), false)
    expect(wrapper.text()).toContain('🏅 Paul')
    expect(wrapper.find('[data-testid="mvp-time-left"]').exists()).toBe(false)
  })
})
