import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import type { ClientPlayerBadge } from '@skol-arena/shared'
import { mountWithPlugins } from '@/test-support/mount'
import PlayerBadges from '../PlayerBadges.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const getPlayerBadges = vi.fn()
vi.mock('@/composables/rules/rules.api', () => ({ rulesApi: { getPlayerBadges: () => getPlayerBadges() } }))
vi.mock('@/composables/notification/notification.socket', () => ({ onWsEvent: () => () => {} }))

function award(overrides: Partial<ClientPlayerBadge> = {}): ClientPlayerBadge {
  return {
    id: 'award-1',
    playerId: 'p1',
    ruleId: 'rule-streak',
    icon: 'fa fa-fire',
    label: 'Inarrêtable',
    description: '5 victoires',
    recurrence: 'per_season',
    awardedAt: new Date('2026-03-12T10:00:00Z'),
    matchId: 'm1',
    seasonId: 'season-4',
    seasonName: 'Saison 4',
    ...overrides,
  }
}

async function mountWith(badges: ClientPlayerBadge[]) {
  getPlayerBadges.mockResolvedValue(badges)
  const wrapper = mountWithPlugins(PlayerBadges, { props: { playerId: 'p1' } })
  await flushPromises()
  return wrapper
}

describe('PlayerBadges', () => {
  beforeEach(() => getPlayerBadges.mockReset())

  it('shows one tile per badge, however many times it was won', async () => {
    const wrapper = await mountWith([
      award({ id: 'a1', seasonId: 'season-4', seasonName: 'Saison 4' }),
      award({ id: 'a2', seasonId: 'season-3', seasonName: 'Saison 3', awardedAt: new Date('2025-11-08T10:00:00Z') }),
      award({ id: 'a3', ruleId: 'rule-night', label: 'Noctambule' }),
    ])

    const labels = wrapper.findAll('.font-semibold.text-sm').map((el) => el.text())
    expect(labels).toEqual(['Inarrêtable', 'Noctambule'])
  })

  it('counts the repetitions of a seasonal badge', async () => {
    const wrapper = await mountWith([
      award({ id: 'a1', seasonId: 'season-4' }),
      award({ id: 'a2', seasonId: 'season-3' }),
      award({ id: 'a3', seasonId: 'season-1' }),
    ])

    expect(wrapper.text()).toContain('×3')
  })

  it('shows no count for a badge won once', async () => {
    const wrapper = await mountWith([award()])
    expect(wrapper.text()).not.toContain('×')
  })

  it('renders nothing when the player has no badge', async () => {
    const wrapper = await mountWith([])
    expect(wrapper.find('.grid').exists()).toBe(false)
  })
})
