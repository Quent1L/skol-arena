import { describe, it, expect } from 'vitest'
import { createI18n } from 'vue-i18n'
import { RouterLinkStub } from '@vue/test-utils'
import fr from '@/i18n/messages/fr.json'
import type { TournamentVoteStats } from '@skol-arena/shared/types/index'
import { mountWithUi } from '@/test-support/mount'
import VoteStatsCards from '../VoteStatsCards.vue'

const i18n = createI18n({ legacy: false, locale: 'fr', fallbackLocale: 'fr', messages: { fr } })

const player = (i: number) => ({ id: `p${i}`, displayName: `Joueur ${i}`, shortName: `J${i}` })
const ten = Array.from({ length: 10 }, (_, i) => i + 1)

const stats: TournamentVoteStats = {
  fairPlayOfTheWeek: null,
  mvpOfTheWeek: null,
  fairPlayRanking: ten.map((i) => ({ player: player(i), rate: 1 - i / 100, votes: 10, rank: i })),
  mvpRanking: ten.map((i) => ({ player: player(i), titles: 20 - i, rank: i })),
  totals: { votes: 100, positiveRate: 0.9 },
} as TournamentVoteStats

function mountCards() {
  return mountWithUi(VoteStatsCards, {
    props: { stats, minVotes: 3 },
    global: { plugins: [i18n], stubs: { RouterLink: RouterLinkStub } },
  })
}

const rowCount = (wrapper: ReturnType<typeof mountCards>, testId: string) =>
  wrapper.get(`[data-testid="${testId}"]`).findAll('a').length

describe('VoteStatsCards', () => {
  it.each([
    ['fair-play-ranking', 'toggle-fairPlay'],
    ['mvp-ranking', 'toggle-mvp'],
  ])('%s opens on the top 5 and unfolds the rest', async (card, toggle) => {
    const wrapper = mountCards()
    expect(rowCount(wrapper, card)).toBe(5)
    const button = wrapper.get(`[data-test="${toggle}"]`)
    expect(button.text()).toContain('5')

    await button.trigger('click')
    expect(rowCount(wrapper, card)).toBe(10)
  })
})
