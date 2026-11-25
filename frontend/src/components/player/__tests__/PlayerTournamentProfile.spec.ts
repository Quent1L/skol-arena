import { describe, it, expect, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import type { PlayerDetailStats } from '@skol-arena/shared'
import { mountWithPlugins } from '@/test-support/mount'
import PlayerTournamentProfile from '../PlayerTournamentProfile.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params?.name ? `${key}:${params.name}` : key,
  }),
  createI18n: () => ({ global: { t: (key: string) => key }, install: () => {} }),
}))

const teams = [{ id: 't1', name: 'Les Bleus', members: [{ userId: 'p1' }] }]
vi.mock('@/composables/team/team.service', async () => {
  const { ref } = await import('vue')
  const list = ref<unknown[]>([])
  return {
    useTeamService: () => ({
      teams: list,
      loadTeams: async () => {
        list.value = teams
      },
    }),
  }
})

const relation = [
  {
    playerId: 'p2',
    displayName: 'Bob',
    shortName: 'bob',
    matchesPlayed: 3,
    wins: 2,
    losses: 1,
    winRate: 67,
  },
]

function stats(overrides: Partial<PlayerDetailStats> = {}): PlayerDetailStats {
  return {
    totalMatches: 4,
    wins: 3,
    draws: 0,
    losses: 1,
    winRate: 75,
    averageScore: 0,
    tournamentsParticipated: 1,
    recentForm: ['V', 'V', 'D', 'V'],
    mostFrequentPartners: relation,
    bestPartners: relation,
    nemeses: relation,
    outcomeTypeStats: [],
    formatStats: [
      {
        teamSize: 2,
        opponentSizes: [2],
        wins: 3,
        draws: 0,
        losses: 1,
        winRate: 75,
        matchesPlayed: 4,
      },
    ],
    h2hStats: [],
    tournamentHistory: [],
    ...overrides,
  } as PlayerDetailStats
}

const stubs = {
  PlayerBadges: true,
  PlayerRelationStats: true,
  RecentFormSection: true,
  InfoTooltip: true,
}

async function mount(props: Record<string, unknown>) {
  const wrapper = mountWithPlugins(PlayerTournamentProfile, {
    props: { playerId: 'p1', tournamentId: 'tour-1', stats: stats(), ...props },
    global: { stubs },
  })
  await flushPromises()
  return wrapper
}

describe('PlayerTournamentProfile', () => {
  it('shows the record with partners and formats in a flex tournament', async () => {
    const wrapper = await mount({})
    expect(wrapper.text()).toContain('75%')
    expect(wrapper.findComponent({ name: 'PlayerRelationStats' }).exists()).toBe(true)
    expect(wrapper.find('[data-test="format-stats"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="my-team"]').exists()).toBe(false)
  })

  it('names the team and drops the per-partner sections with fixed teams', async () => {
    const wrapper = await mount({ fixedTeam: true })
    expect(wrapper.find('[data-testid="my-team"]').text()).toContain('Les Bleus')
    expect(wrapper.findComponent({ name: 'PlayerRelationStats' }).exists()).toBe(false)
    expect(wrapper.find('[data-test="format-stats"]').exists()).toBe(false)
  })

  it('says so when no match was played yet', async () => {
    const wrapper = await mount({ stats: stats({ totalMatches: 0 }) })
    expect(wrapper.text()).toContain('playerTournamentProfile.noMatches')
    expect(wrapper.text()).not.toContain('75%')
  })
})
