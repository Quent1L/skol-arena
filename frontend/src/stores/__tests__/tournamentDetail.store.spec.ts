import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ref, computed } from 'vue'
import type { WeeklyMmrLeaders } from '@skol-arena/shared/types/index'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: computed(() => true),
    appUser: computed(() => ({ id: 'u1', email: 'u1@test.dev', role: 'player' })),
    userRole: computed(() => 'player'),
  }),
}))

const tournamentRef = ref<{ mode: string } | null>({ mode: 'ranked' })

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

const weeklyMmrLeadersRef = ref<WeeklyMmrLeaders | null>(null)
const playerMmrRef = ref<unknown>(null)
const leaderboardRef = ref<unknown[]>([])
const loadWeeklyMmrLeaders = vi.fn(async (seasonId: string) => {
  weeklyMmrLeadersRef.value = {
    weekStart: new Date(),
    gainers: [{ seasonId }],
    losers: [],
  } as unknown as WeeklyMmrLeaders
})
const loadLeaderboard = vi.fn()
const loadPlayerMmr = vi.fn(async () => {
  playerMmrRef.value = { currentMmr: 1000 }
  return []
})

vi.mock('@/composables/ranked/ranked.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/composables/ranked/ranked.service')>()
  return {
    getCurrentWeekStart: actual.getCurrentWeekStart,
    useRankedService: () => ({
      leaderboard: leaderboardRef,
      provisionalLeaderboard: ref([]),
      seasonMmrLeaderboard: ref([]),
      tiers: ref([]),
      playerMmr: playerMmrRef,
      playerOpponentQuality: ref(undefined),
      weeklyMmrLeaders: weeklyMmrLeadersRef,
      loading: ref(false),
      provisionalLoading: ref(false),
      seasonMmrLoading: ref(false),
      loadLeaderboard,
      loadProvisionalLeaderboard: vi.fn(),
      loadSeasonMmrLeaderboard: vi.fn(),
      loadPlayerMmr,
      loadWeeklyMmrLeaders,
    }),
  }
})

const statsRef = ref<unknown>(null)
const loadStats = vi.fn(async () => {
  statsRef.value = { momentum: [] }
})

vi.mock('@/composables/tournament/tournament-stats.service', () => ({
  useTournamentStatsService: () => ({
    stats: statsRef,
    loading: ref(false),
    error: ref(null),
    loadStats,
  }),
}))

vi.mock('@/composables/player/player.api', () => ({
  playerApi: { getStats: vi.fn(async () => ({ stats: {} })) },
}))

import { useTournamentDetailStore } from '../tournamentDetail.store'
import {
  REFRESH_DONE_MS,
  REFRESH_INDICATOR_DELAY_MS,
} from '@/composables/ui/useBackgroundRefresh'

// A Wednesday, so the week start (Monday) is unambiguous.
const WEDNESDAY = new Date('2026-03-11T10:00:00')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(WEDNESDAY)
  setActivePinia(createPinia())
  tournamentRef.value = { mode: 'ranked' }
  weeklyMmrLeadersRef.value = null
  playerMmrRef.value = null
  leaderboardRef.value = []
  statsRef.value = null
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useTournamentDetailStore — tournament-scoped state', () => {
  it('initialize with a new id clears the caches of the previous tournament', async () => {
    const store = useTournamentDetailStore()
    await store.initialize('tournament-a')
    await store.ensureStats()
    await store.ensureWeeklyMmrLeaders()
    expect(store.weeklyMmrLeaders).not.toBeNull()
    expect(store.tournamentStats).not.toBeNull()

    await store.initialize('tournament-b')

    expect(store.weeklyMmrLeaders).toBeNull()
    expect(store.tournamentStats).toBeNull()
    expect(store.rankedLeaderboard).toEqual([])
    expect(store.isLeaderboardRecalculating).toBe(false)
  })

  it('initialize with the same id keeps the caches', async () => {
    const store = useTournamentDetailStore()
    await store.initialize('tournament-a')
    await store.ensureWeeklyMmrLeaders()

    await store.initialize('tournament-a')

    expect(store.weeklyMmrLeaders).not.toBeNull()
  })

  // A remount on the same tournament (returning from match entry) rehydrates the caches
  // from the previous mount, so they have to be revalidated instead of trusted.
  it('initialize with the same id revalidates the warm caches', async () => {
    const store = useTournamentDetailStore()
    await store.initialize('tournament-a')
    await store.ensureStats()
    await store.ensureWeeklyMmrLeaders()
    await store.ensurePlayerProfile()
    vi.clearAllMocks()

    await store.initialize('tournament-a')

    expect(loadStats).toHaveBeenCalledTimes(1)
    expect(loadWeeklyMmrLeaders).toHaveBeenCalledTimes(1)
    expect(loadPlayerMmr).toHaveBeenCalledTimes(1)
  })

  it('initialize does not revalidate caches that were never loaded', async () => {
    const store = useTournamentDetailStore()
    await store.initialize('tournament-a')
    vi.clearAllMocks()

    await store.initialize('tournament-a')

    expect(loadStats).not.toHaveBeenCalled()
    expect(loadWeeklyMmrLeaders).not.toHaveBeenCalled()
    expect(loadPlayerMmr).not.toHaveBeenCalled()
  })
})

describe('useTournamentDetailStore — weekly MMR leaders', () => {
  it('ensureWeeklyMmrLeaders does not refetch within the same week', async () => {
    const store = useTournamentDetailStore()
    await store.initialize('tournament-a')

    await store.ensureWeeklyMmrLeaders()
    await store.ensureWeeklyMmrLeaders()

    expect(loadWeeklyMmrLeaders).toHaveBeenCalledTimes(1)
  })

  it('ensureWeeklyMmrLeaders refetches after the Monday rollover', async () => {
    const store = useTournamentDetailStore()
    await store.initialize('tournament-a')
    await store.ensureWeeklyMmrLeaders()

    // Next Wednesday: a new week started, the cached movers are stale.
    vi.setSystemTime(new Date('2026-03-18T10:00:00'))
    await store.ensureWeeklyMmrLeaders()

    expect(loadWeeklyMmrLeaders).toHaveBeenCalledTimes(2)
  })

  it('reloadWeeklyMmrLeaders always refetches', async () => {
    const store = useTournamentDetailStore()
    await store.initialize('tournament-a')
    await store.ensureWeeklyMmrLeaders()

    await store.reloadWeeklyMmrLeaders()

    expect(loadWeeklyMmrLeaders).toHaveBeenCalledTimes(2)
  })

  it('does nothing when the tournament is not ranked', async () => {
    tournamentRef.value = { mode: 'championship' }
    const store = useTournamentDetailStore()
    await store.initialize('tournament-a')

    await store.ensureWeeklyMmrLeaders()
    await store.reloadWeeklyMmrLeaders()

    expect(loadWeeklyMmrLeaders).not.toHaveBeenCalled()
  })
})

describe('useTournamentDetailStore — background refresh indicator', () => {
  it('announces a slow refresh and confirms it landed', async () => {
    const store = useTournamentDetailStore()
    await store.initialize('tournament-a')
    let release!: () => void
    loadLeaderboard.mockImplementationOnce(() => new Promise<void>((res) => (release = res)))
    leaderboardRef.value = [{ id: 'p1' }]

    const running = store.refreshSilently()
    await vi.advanceTimersByTimeAsync(REFRESH_INDICATOR_DELAY_MS)
    expect(store.isRefreshing).toBe(true)

    release()
    await running
    expect(store.isRefreshing).toBe(false)
    expect(store.justRefreshed).toBe(true)

    await vi.advanceTimersByTimeAsync(REFRESH_DONE_MS)
    expect(store.justRefreshed).toBe(false)
  })

  it('leaves a fast refresh invisible', async () => {
    const store = useTournamentDetailStore()
    await store.initialize('tournament-a')

    await store.refreshSilently()

    expect(store.isRefreshing).toBe(false)
    expect(store.justRefreshed).toBe(false)
  })

  it('refreshAfterLeaderboardUpdate reloads the warm caches under the same indicator', async () => {
    const store = useTournamentDetailStore()
    await store.initialize('tournament-a')
    await store.ensureStats()
    await store.ensureWeeklyMmrLeaders()
    vi.clearAllMocks()
    let release!: () => void
    loadLeaderboard.mockImplementationOnce(() => new Promise<void>((res) => (release = res)))

    const running = store.refreshAfterLeaderboardUpdate()
    await vi.advanceTimersByTimeAsync(REFRESH_INDICATOR_DELAY_MS)
    expect(store.isRefreshing).toBe(true)

    release()
    await running
    expect(loadStats).toHaveBeenCalledTimes(1)
    expect(loadWeeklyMmrLeaders).toHaveBeenCalledTimes(1)
    expect(store.justRefreshed).toBe(true)
  })

  it('bumps the match list key on both refresh paths', async () => {
    const store = useTournamentDetailStore()
    await store.initialize('tournament-a')
    const before = store.matchesRefreshKey

    await store.refreshSilently()
    await store.refreshAfterLeaderboardUpdate()

    expect(store.matchesRefreshKey).toBe(before + 2)
  })
})

describe('useTournamentDetailStore — uninitialized store', () => {
  it('reload actions are no-ops without a tournament id', async () => {
    const store = useTournamentDetailStore()

    await store.reloadStats()
    await store.reloadLeaderboard()
    await store.reloadWeeklyMmrLeaders()
    await store.refreshSilently()
    await store.refreshAfterLeaderboardUpdate()

    expect(loadStats).not.toHaveBeenCalled()
    expect(loadLeaderboard).not.toHaveBeenCalled()
    expect(loadWeeklyMmrLeaders).not.toHaveBeenCalled()
  })
})

describe('useTournamentDetailStore — player profile loaded state', () => {
  function deferPlayerMmr() {
    let resolve!: (mmr: unknown) => void
    loadPlayerMmr.mockImplementationOnce(
      () =>
        new Promise<never[]>((done) => {
          resolve = (mmr) => {
            playerMmrRef.value = mmr
            done([])
          }
        }),
    )
    return (mmr: unknown) => resolve(mmr)
  }

  // The empty state used to key off the ranked loading flag, which the weekly movers
  // clear as well: answering first, they showed "no MMR" while the profile was loading.
  it('stays unloaded while the profile is pending, whatever else answers first', async () => {
    const store = useTournamentDetailStore()
    await store.initialize('tournament-a')
    const answerProfile = deferPlayerMmr()

    const profile = store.ensurePlayerProfile()
    await store.ensureWeeklyMmrLeaders()
    expect(store.playerProfileLoaded).toBe(false)

    answerProfile({ currentMmr: 1000 })
    await profile
    expect(store.playerProfileLoaded).toBe(true)
  })

  it('is loaded once the profile answers with no MMR', async () => {
    loadPlayerMmr.mockImplementationOnce(async () => [])
    const store = useTournamentDetailStore()
    await store.initialize('tournament-a')

    await store.ensurePlayerProfile()

    expect(store.playerMmr).toBeNull()
    expect(store.playerProfileLoaded).toBe(true)
  })

  it('shares the request in flight between concurrent callers', async () => {
    const store = useTournamentDetailStore()
    await store.initialize('tournament-a')

    await Promise.all([store.ensurePlayerProfile(), store.ensurePlayerProfile()])

    expect(loadPlayerMmr).toHaveBeenCalledTimes(1)
  })

  it('goes back to unloaded on another tournament', async () => {
    const store = useTournamentDetailStore()
    await store.initialize('tournament-a')
    await store.ensurePlayerProfile()

    await store.initialize('tournament-b')

    expect(store.playerProfileLoaded).toBe(false)
  })
})
