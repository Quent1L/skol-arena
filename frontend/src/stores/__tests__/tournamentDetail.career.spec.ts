import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ref, computed } from 'vue'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: computed(() => true),
    appUser: computed(() => ({ id: 'u1', email: 'u1@test.dev', role: 'player' })),
    userRole: computed(() => 'player'),
  }),
}))

const tournamentRef = ref<Record<string, unknown> | null>({
  id: 'season-1',
  mode: 'ranked',
  disciplineId: 'disc-1',
})
vi.mock('@/composables/tournament/tournament.service', () => ({
  useTournamentService: () => ({
    currentTournament: tournamentRef,
    error: ref(null),
    loadTournamentWithErrorHandling: vi.fn(),
    isTournamentOpenForJoin: () => false,
    canLeaveTournament: () => false,
    canManageTournament: () => false,
    canCreateMatchInTournament: () => false,
    recalculatePoints: vi.fn(),
    clearCache: vi.fn(),
  }),
}))
vi.mock('@/composables/participant.service', () => ({
  useParticipantService: () => ({
    participants: ref([]),
    participantCount: computed(() => 0),
    loading: ref(false),
    isUserParticipant: () => false,
    getTournamentParticipants: vi.fn(),
    joinTournamentAndReload: vi.fn(),
    leaveTournamentAndReload: vi.fn(),
  }),
}))
vi.mock('@/composables/ranked/ranked.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/composables/ranked/ranked.service')>()
  return {
    getCurrentWeekStart: actual.getCurrentWeekStart,
    useRankedService: () => ({
      leaderboard: ref([]),
      provisionalLeaderboard: ref([]),
      seasonMmrLeaderboard: ref([]),
      tiers: ref([]),
      playerMmr: ref(null),
      playerOpponentQuality: ref(undefined),
      weeklyMmrLeaders: ref(null),
      loading: ref(false),
      provisionalLoading: ref(false),
      seasonMmrLoading: ref(false),
      loadLeaderboard: vi.fn(),
      loadProvisionalLeaderboard: vi.fn(),
      loadSeasonMmrLeaderboard: vi.fn(),
      loadPlayerMmr: vi.fn(async () => []),
      loadWeeklyMmrLeaders: vi.fn(),
    }),
  }
})
vi.mock('@/composables/tournament/tournament-stats.service', () => ({
  useTournamentStatsService: () => ({
    stats: ref(null),
    loading: ref(false),
    error: ref(null),
    loadStats: vi.fn(),
  }),
}))
vi.mock('@/composables/player/player.api', () => ({
  playerApi: { getStats: vi.fn(async () => ({ stats: {} })) },
}))

const season = (over: Record<string, unknown>) => ({
  seasonId: 'x',
  seasonName: 'x',
  seasonStatus: 'finished',
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-06-30'),
  discipline: { id: 'disc-1', name: 'Billard', icon: null },
  peakMmr: 1200,
  avgMmr: 1100,
  entryMmr: 1000,
  finalMmr: 1150,
  matchesPlayed: 10,
  wins: 6,
  losses: 4,
  draws: 0,
  placementMatches: 5,
  placementsComplete: true,
  tiers: [],
  ...over,
})

const getPlayerCareer = vi.fn(async () => ({
  seasons: [
    season({
      seasonId: 'season-1',
      seasonName: 'Billard S2',
      seasonStatus: 'ongoing',
      endDate: new Date('2026-06-30'),
      peakMmr: 1200,
    }),
    season({ seasonId: 'season-0', seasonName: 'Billard S1', peakMmr: 1450 }),
    season({
      seasonId: 'chess-1',
      seasonName: 'Echecs S1',
      peakMmr: 1900,
      discipline: { id: 'disc-2', name: 'Echecs', icon: null },
    }),
  ],
}))
vi.mock('@/composables/ranked/ranked.api', () => ({
  rankedApi: { getPlayerCareer: () => getPlayerCareer() },
}))

import { useTournamentDetailStore } from '../tournamentDetail.store'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('tournamentDetail store — ranked career', () => {
  async function ready() {
    const store = useTournamentDetailStore()
    await store.initialize('season-1')
    await store.ensurePlayerCareer()
    return store
  }

  it('resolves the discipline the season is played under', async () => {
    expect((await ready()).currentDisciplineId).toBe('disc-1')
  })

  it('keeps the full career available', async () => {
    expect((await ready()).playerCareer).toHaveLength(3)
  })

  it('reads the all-time record on that discipline only', async () => {
    // 1900 in Echecs is higher, and must not win here
    expect((await ready()).playerCareerPeak).toMatchObject({
      mmr: 1450,
      seasonName: 'Billard S1',
    })
  })

  it('leaves the career alone on a non-ranked competition', async () => {
    tournamentRef.value = { id: 'champ-1', mode: 'championship', disciplineId: 'disc-1' }
    const store = useTournamentDetailStore()
    await store.initialize('champ-1')
    await store.ensurePlayerCareer()

    expect(getPlayerCareer).not.toHaveBeenCalled()
    expect(store.playerCareer).toBeNull()
    expect(store.playerCareerPeak).toBeNull()
  })
})
