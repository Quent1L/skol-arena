import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ref, computed } from 'vue'

const h = vi.hoisted(() => ({
  push: vi.fn(),
  joinAndReload: vi.fn(),
  leaveAndReload: vi.fn(),
  getParticipants: vi.fn(),
  recalculatePoints: vi.fn(),
  clearCache: vi.fn(),
  loadLeaderboard: vi.fn(),
  loadPlayerMmr: vi.fn(),
  getStats: vi.fn(),
  getPlayerCareer: vi.fn(),
  flags: {
    authenticated: true,
    open: true,
    canLeave: false,
    canManage: false,
    participant: false,
    role: 'player',
  },
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ push: h.push }) }))
vi.mock('@/i18n', () => ({ i18n: { global: { t: (key: string) => key } } }))

const appUserRef = ref<{ id: string; role: string } | null>({ id: 'me', role: 'player' })
vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: computed(() => h.flags.authenticated),
    appUser: appUserRef,
    userRole: computed(() => h.flags.role),
  }),
}))

const tournamentRef = ref<Record<string, unknown> | null>(null)
vi.mock('@/composables/tournament/tournament.service', () => ({
  useTournamentService: () => ({
    currentTournament: tournamentRef,
    error: ref(null),
    loadTournamentWithErrorHandling: vi.fn(),
    isTournamentOpenForJoin: () => h.flags.open,
    canLeaveTournament: () => h.flags.canLeave,
    canManageTournament: () => h.flags.canManage,
    canCreateMatchInTournament: (_t: unknown, authed: boolean, participant: boolean) =>
      authed && participant,
    recalculatePoints: h.recalculatePoints,
    clearCache: h.clearCache,
  }),
}))

vi.mock('@/composables/participant.service', () => ({
  useParticipantService: () => ({
    participants: ref([]),
    participantCount: computed(() => 0),
    loading: ref(false),
    isUserParticipant: () => h.flags.participant,
    getTournamentParticipants: h.getParticipants,
    joinTournamentAndReload: h.joinAndReload,
    leaveTournamentAndReload: h.leaveAndReload,
  }),
}))

const leaderboardRef = ref<unknown[]>([])
const playerMmrRef = ref<unknown>(null)
vi.mock('@/composables/ranked/ranked.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/composables/ranked/ranked.service')>()
  return {
    ...actual,
    useRankedService: () => ({
      leaderboard: leaderboardRef,
      provisionalLeaderboard: ref([]),
      seasonMmrLeaderboard: ref([]),
      tiers: ref([]),
      placementMatches: ref(0),
      playerMmr: playerMmrRef,
      playerOpponentQuality: ref(undefined),
      weeklyMmrLeaders: ref(null),
      loading: ref(false),
      provisionalLoading: ref(false),
      seasonMmrLoading: ref(false),
      loadLeaderboard: h.loadLeaderboard,
      loadProvisionalLeaderboard: vi.fn(),
      loadSeasonMmrLeaderboard: vi.fn(),
      loadPlayerMmr: h.loadPlayerMmr,
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
vi.mock('@/composables/player/player.api', () => ({ playerApi: { getStats: h.getStats } }))
vi.mock('@/composables/ranked/ranked.api', () => ({
  rankedApi: { getPlayerCareer: h.getPlayerCareer },
}))

import { useTournamentDetailStore } from '../tournamentDetail.store'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  Object.assign(h.flags, {
    authenticated: true,
    open: true,
    canLeave: false,
    canManage: false,
    participant: false,
    role: 'player',
  })
  appUserRef.value = { id: 'me', role: 'player' }
  tournamentRef.value = { mode: 'ranked', startDate: '2026-03-01', endDate: '2026-03-11', disciplineId: 'd1' }
  leaderboardRef.value = []
  playerMmrRef.value = null
  h.loadPlayerMmr.mockResolvedValue([])
  h.getStats.mockResolvedValue({ stats: {} })
})

async function ready(id = 't1') {
  const store = useTournamentDetailStore()
  await store.initialize(id)
  return store
}

describe('permissions', () => {
  it('lets a player join an open tournament, but never a kiosk', async () => {
    const store = await ready()
    expect(store.canJoinTournament).toBe(true)

    appUserRef.value = { id: 'kiosk', role: 'kiosk' }
    expect(store.canJoinTournament).toBe(false)
  })

  it('only lets an authenticated user with a tournament manage it', async () => {
    h.flags.canManage = true
    const store = await ready()
    expect(store.canManageTournament).toBe(true)

    tournamentRef.value = null
    expect(store.canManageTournament).toBe(false)
  })

  it('refuses management to an anonymous visitor even if the service allows it', async () => {
    h.flags.canManage = true
    h.flags.authenticated = false
    const store = await ready()

    expect(store.canManageTournament).toBe(false)
  })

  it('lets a participant create a match', async () => {
    h.flags.participant = true
    const store = await ready()

    expect(store.isParticipant).toBe(true)
    expect(store.canCreateMatch).toBe(true)
  })

  it('formats the duration of a tournament, and is blank without one', async () => {
    const store = await ready()
    expect(store.tournamentDuration).not.toBe('')

    tournamentRef.value = null
    expect(store.tournamentDuration).toBe('')
  })
})

describe('menu', () => {
  it('is empty for a plain visitor', async () => {
    const store = await ready()

    expect(store.menuItems).toEqual([])
  })

  it('offers a manager the ranked edit form, recalculation and cache clearing', async () => {
    h.flags.canManage = true
    const store = await ready()

    const [edit, recalculate, clear] = store.menuItems
    expect(store.menuItems).toHaveLength(3)

    edit.command()
    expect(h.push).toHaveBeenCalledWith('/admin/ranked/t1/edit')
    recalculate.command()
    expect(h.recalculatePoints).toHaveBeenCalledWith('t1')
    clear.command()
    expect(h.clearCache).toHaveBeenCalledWith('t1')
  })

  it('sends a manager of a classic tournament to the tournament form, without recalculation when there is no mode', async () => {
    h.flags.canManage = true
    tournamentRef.value = { mode: 'championship' }
    const store = await ready()
    store.menuItems[0].command()
    expect(h.push).toHaveBeenCalledWith('/admin/tournaments/t1/edit')

    tournamentRef.value = { mode: undefined }
    expect(store.menuItems).toHaveLength(2)
  })

  it('offers a participant who may leave the way out', async () => {
    h.flags.participant = true
    h.flags.canLeave = true
    const store = await ready()

    expect(store.menuItems).toHaveLength(1)
    store.menuItems[0].command()
    await Promise.resolve()
    expect(h.leaveAndReload).toHaveBeenCalledWith('t1')
  })
})

describe('actions', () => {
  it('raises and lowers the joining flag around a join', async () => {
    let release!: () => void
    h.joinAndReload.mockReturnValue(new Promise<void>((r) => (release = r)))
    const store = await ready()

    const pending = store.joinTournament()
    expect(store.joining).toBe(true)
    release()
    await pending

    expect(store.joining).toBe(false)
    expect(h.joinAndReload).toHaveBeenCalledWith('t1')
  })

  it('lowers the leaving flag even when leaving fails', async () => {
    h.leaveAndReload.mockRejectedValue(new Error('no'))
    const store = await ready()

    await expect(store.leaveTournament()).rejects.toThrow('no')

    expect(store.leaving).toBe(false)
  })

  it('reloads participants and forwards recalculation and cache clearing', async () => {
    const store = await ready()

    await store.reloadParticipants()
    await store.recalculatePoints()
    await store.clearCache()

    expect(h.getParticipants).toHaveBeenCalledWith('t1')
    expect(h.recalculatePoints).toHaveBeenCalledWith('t1')
    expect(h.clearCache).toHaveBeenCalledWith('t1')
  })

  it('loads the leaderboard once, not when it is already there', async () => {
    const store = await ready()
    h.loadLeaderboard.mockClear()

    await store.ensureLeaderboard()
    expect(h.loadLeaderboard).toHaveBeenCalledWith('t1')

    leaderboardRef.value = [{ matchesPlayed: 5, currentMmr: 1000, player: { id: 'x' } }]
    await store.ensureLeaderboard()
    expect(h.loadLeaderboard).toHaveBeenCalledTimes(1)
  })
})

describe('player profile and career', () => {
  it('shares one in-flight profile request and marks the profile loaded', async () => {
    const store = await ready()

    await Promise.all([store.ensurePlayerProfile(), store.ensurePlayerProfile()])

    expect(h.loadPlayerMmr).toHaveBeenCalledTimes(1)
    expect(h.getStats).toHaveBeenCalledWith('me', { tournamentId: 't1' })
    expect(store.playerProfileLoaded).toBe(true)
  })

  it('skips the profile of a non-ranked competition or of an anonymous user', async () => {
    tournamentRef.value = { mode: 'championship' }
    const store = await ready()
    await store.ensurePlayerProfile()

    appUserRef.value = null
    tournamentRef.value = { mode: 'ranked' }
    await store.ensurePlayerProfile()

    expect(h.loadPlayerMmr).not.toHaveBeenCalled()
  })

  it('loads the career once, falls back to an empty one on failure', async () => {
    h.getPlayerCareer.mockResolvedValueOnce({
      seasons: [{ seasonId: 't1', discipline: { id: 'd1' } }],
    })
    const store = await ready()

    await store.ensurePlayerCareer()
    await store.ensurePlayerCareer()

    expect(h.getPlayerCareer).toHaveBeenCalledTimes(1)
    expect(store.hasDisciplineCareer).toBe(true)
  })

  it('has an empty career when the request fails, and no discipline career', async () => {
    h.getPlayerCareer.mockRejectedValue(new Error('down'))
    const store = await ready()

    await store.ensurePlayerCareer()

    expect(store.playerCareer).toEqual([])
    expect(store.hasDisciplineCareer).toBe(false)
  })

  it('ranks the viewer among the placed players only', async () => {
    const store = await ready()
    leaderboardRef.value = [
      { matchesPlayed: 9, currentMmr: 1200, player: { id: 'other' } },
      { matchesPlayed: 9, currentMmr: 1100, player: { id: 'me' } },
    ]

    expect(store.playerLeaderboardRank).toBe(2)

    leaderboardRef.value = []
    expect(store.playerLeaderboardRank).toBeUndefined()
  })
})
