import { describe, it, expect, vi } from 'vitest'
import type { ClientMatchCard } from '@skol-arena/shared/types/index'
import { mountWithUi } from '@/test-support/mount'
import MatchCard from '../MatchCard.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'fr' } }),
}))

function side(position: number, rank: number | null, ids: string[], score = 0) {
  return {
    position,
    rank,
    score,
    isWinner: rank === 1,
    players: ids.map((id) => ({ id, displayName: id.toUpperCase(), shortName: id })),
  }
}

function card(
  sides: ClientMatchCard['sides'],
  over: Partial<ClientMatchCard> = {},
): ClientMatchCard {
  return {
    id: 'm1',
    playedAt: new Date('2026-06-01T10:00:00Z'),
    status: 'finalized',
    tournament: { id: 't1', name: 'Cup', mode: 'championship', scoreEnabled: true },
    sides,
    outcomeType: null,
    ...over,
  }
}

const threeWay = [side(1, 2, ['a'], 5), side(2, 1, ['b', 'c'], 9), side(3, 3, ['d'], 1)]

describe('MatchCard', () => {
  it('keeps the duel layout for two sides', () => {
    const wrapper = mountWithUi(MatchCard, {
      props: { entry: card([side(1, 1, ['a'], 3), side(2, 2, ['b'], 1)]) },
    })

    expect(wrapper.find('[data-testid="match-card-ranking"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('1v1')
  })

  it('lists three sides by placement with their scores', () => {
    const wrapper = mountWithUi(MatchCard, { props: { entry: card(threeWay) } })

    const rows = wrapper.findAll('[data-testid="match-card-ranking"] li')
    expect(rows.map((r) => r.text().replace(/\s+/g, ' '))).toEqual([
      expect.stringContaining('B / C'),
      expect.stringContaining('A'),
      expect.stringContaining('D'),
    ])
    expect(rows[0].text()).toContain('9')
    expect(wrapper.text()).toContain('1v2v1')
  })

  it('reads a second place as a loss, whatever the MMR moved', () => {
    const wrapper = mountWithUi(MatchCard, {
      props: { entry: card(threeWay, { playerId: 'a', mmrDelta: 4 }), currentPlayerId: 'a' },
    })

    expect(wrapper.text()).toContain('matchCard.loss')
    // The player's own side leads the format badge
    expect(wrapper.text()).toContain('1v2v1')
  })

  it('reads a lone first place as a win', () => {
    const wrapper = mountWithUi(MatchCard, {
      props: { entry: card(threeWay, { playerId: 'b' }), currentPlayerId: 'b' },
    })

    expect(wrapper.text()).toContain('matchCard.win')
    expect(wrapper.text()).toContain('2v1v1')
  })
})
