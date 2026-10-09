import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useTournamentService } from '@/composables/tournament/tournament.service'
import { useParticipantService } from '@/composables/participant.service'
import {
  useRankedService,
  getCurrentWeekStart,
  splitByPlacement,
} from '@/composables/ranked/ranked.service'
import { useTournamentStatsService } from '@/composables/tournament/tournament-stats.service'
import { useBackgroundRefresh } from '@/composables/ui/useBackgroundRefresh'
import { playerApi } from '@/composables/player/player.api'
import { rankedApi } from '@/composables/ranked/ranked.api'
import { careerPeak } from '@/composables/ranked/career'
import { calculateDuration } from '@/utils/DateUtils'
import { assignCompetitionRanks } from '@/utils/competition-rank'
import type {
  MmrChartPoint,
  PlayerCareerSeason,
  PlayerStatsResponse,
} from '@skol-arena/shared/types/index'

export const useTournamentDetailStore = defineStore('tournamentDetail', () => {
  const router = useRouter()
  const { isAuthenticated, appUser, userRole } = useAuth()

  const tournamentSvc = useTournamentService()
  const participantSvc = useParticipantService()
  const rankedSvc = useRankedService()
  const statsSvc = useTournamentStatsService()
  // Refreshes that happen under the reader — a tab return, a finalization landing
  // over the socket — swap the data with no warning. This makes them legible
  // without ever taking the current data off screen.
  const backgroundRefresh = useBackgroundRefresh()

  // Local state
  const tournamentId = ref('')
  const isInitialLoading = ref(true)
  const joining = ref(false)
  const leaving = ref(false)
  const profileChartHistory = ref<MmrChartPoint[]>([])
  // Keyed on the logged-in player, not on the tournament, so it survives
  // `resetTournamentScopedState`. Null means "not loaded yet"; an empty array is a
  // player with no ranked history.
  const playerCareer = ref<PlayerCareerSeason[] | null>(null)
  const playerStats = ref<PlayerStatsResponse | null>(null)
  const isLeaderboardRecalculating = ref(false)
  // Bumped whenever the server-side match data may have moved. The match list owns
  // its own paging and filters, so it cannot be reloaded from here — it watches this
  // and refetches the range it already shows.
  const matchesRefreshKey = ref(0)
  // Week the cached weeklyMmrLeaders belongs to, so a session left open across the
  // Monday rollover doesn't keep rendering last week's movers.
  const weeklyMmrWeekStart = ref<number | null>(null)

  // Pass-through refs from services
  const tournament = tournamentSvc.currentTournament
  const error = tournamentSvc.error
  const participants = participantSvc.participants
  const participantCount = participantSvc.participantCount
  const loadingParticipants = participantSvc.loading
  const rankedLeaderboard = rankedSvc.leaderboard
  const rankedProvisionalLeaderboard = rankedSvc.provisionalLeaderboard
  const rankedSeasonMmrLeaderboard = rankedSvc.seasonMmrLeaderboard
  const rankedTiers = rankedSvc.tiers
  const rankedPlacementMatches = rankedSvc.placementMatches
  const playerMmr = rankedSvc.playerMmr
  const playerOpponentQuality = rankedSvc.playerOpponentQuality
  const weeklyMmrLeaders = rankedSvc.weeklyMmrLeaders
  const rankedLoading = rankedSvc.loading
  const rankedProvisionalLoading = rankedSvc.provisionalLoading
  const rankedSeasonMmrLoading = rankedSvc.seasonMmrLoading
  const tournamentStats = statsSvc.stats
  const tournamentStatsLoading = statsSvc.loading
  const statsError = statsSvc.error

  // Computed permissions
  const isParticipant = computed(() => participantSvc.isUserParticipant(appUser.value?.id))

  const canJoinTournament = computed(
    () =>
      tournamentSvc.isTournamentOpenForJoin(tournament.value) &&
      appUser.value?.role !== 'kiosk',
  )

  const canLeaveTournament = computed(() => tournamentSvc.canLeaveTournament(tournament.value))

  const canManageTournament = computed(() => {
    if (!isAuthenticated.value || !tournament.value) return false
    return tournamentSvc.canManageTournament(tournament.value)
  })

  const canCreateMatch = computed(() =>
    tournamentSvc.canCreateMatchInTournament(
      tournament.value,
      isAuthenticated.value,
      isParticipant.value,
      userRole.value,
    ),
  )

  const tournamentDuration = computed(() => {
    if (!tournament.value) return ''
    return calculateDuration(tournament.value.startDate, tournament.value.endDate)
  })

  // Players still in placement hold no rank: the leaderboard lists them apart, so
  // the ranking is computed on the settled players only. Competition ranks, to
  // match what LeaderboardTierList renders — a tie must read the same in both.
  const playerLeaderboardRank = computed(() => {
    if (!appUser.value || !rankedLeaderboard.value.length) return undefined
    const { placed } = splitByPlacement(rankedLeaderboard.value, rankedPlacementMatches.value)
    const mine = assignCompetitionRanks(placed, (p) => p.currentMmr).find(
      ({ item }) => item.player?.id === appUser.value?.id,
    )
    return mine?.rank
  })

  const menuItems = computed(() => {
    const items: { label: string; icon: string; command: () => void }[] = []
    if (canManageTournament.value) {
      // A ranked season is a tournament row, but it is not edited through the
      // tournament form: its own admin form is the only one exposing the ranked
      // settings, so send the user there instead of a form missing half the fields.
      const editPath =
        tournament.value?.mode === 'ranked'
          ? `/admin/ranked/${tournamentId.value}/edit`
          : `/admin/tournaments/${tournamentId.value}/edit`
      items.push({
        label: 'Modifier',
        icon: 'i-fa7-solid:pencil',
        command: () => router.push(editPath),
      })
      if (tournament.value?.mode) {
        items.push({
          label: 'Recalculer les points',
          icon: 'i-fa7-solid:calculator',
          command: () => recalculatePoints(),
        })
      }
      items.push({
        label: 'Vider le cache',
        icon: 'i-fa7-solid:trash-can',
        command: () => clearCache(),
      })
    }
    if (isAuthenticated.value && isParticipant.value && canLeaveTournament.value) {
      items.push({ label: 'Quitter', icon: 'i-fa7-solid:user-minus', command: () => leaveTournament() })
    }
    return items
  })

  // Actions

  // This store is a singleton but is instantiated by several components outside
  // TournamentDetailView (match detail, match stepper), so $dispose() on unmount is not a
  // reliable reset. Clear every tournament-scoped cache here, otherwise the `ensure*`
  // guards below short-circuit and render the previous tournament's data.
  function resetTournamentScopedState() {
    weeklyMmrLeaders.value = null
    weeklyMmrWeekStart.value = null
    tournamentStats.value = null
    playerMmr.value = null
    playerStats.value = null
    profileChartHistory.value = []
    rankedLeaderboard.value = []
    rankedProvisionalLeaderboard.value = []
    rankedSeasonMmrLeaderboard.value = []
    isLeaderboardRecalculating.value = false
  }

  // Pinia keeps `pinia.state.value[$id]` when a store is disposed, so a remount rehydrates
  // the previous caches and every `ensure*` guard below short-circuits on them. Coming back
  // from match entry — a sibling route, so the view really unmounts — that means rendering
  // pre-match MMR, weekly gain and stats. The WS refresh doesn't cover it either: the view
  // was unmounted when `leaderboard_updated` fired. initialize() already refetches the
  // tournament, the participants and the leaderboard, so revalidate the rest here.
  async function revalidateWarmCaches() {
    const promises: Promise<unknown>[] = []
    if (playerMmr.value !== null) promises.push(reloadPlayerProfile())
    if (tournamentStats.value !== null) promises.push(reloadStats())
    if (weeklyMmrLeaders.value !== null) promises.push(reloadWeeklyMmrLeaders())
    await Promise.all(promises)
  }

  async function initialize(id: string) {
    const isSameTournament = id === tournamentId.value
    if (!isSameTournament) resetTournamentScopedState()
    tournamentId.value = id
    isInitialLoading.value = true
    try {
      await tournamentSvc.loadTournamentWithErrorHandling(id)
      if (tournament.value) {
        await participantSvc.getTournamentParticipants(id)
        if (tournament.value.mode === 'ranked') {
          await rankedSvc.loadLeaderboard(id)
        }
        if (isSameTournament) await revalidateWarmCaches()
      }
    } finally {
      isInitialLoading.value = false
    }
  }

  async function joinTournament() {
    try {
      joining.value = true
      await participantSvc.joinTournamentAndReload(tournamentId.value)
    } finally {
      joining.value = false
    }
  }

  async function leaveTournament() {
    try {
      leaving.value = true
      await participantSvc.leaveTournamentAndReload(tournamentId.value)
    } finally {
      leaving.value = false
    }
  }

  async function reloadParticipants() {
    await participantSvc.getTournamentParticipants(tournamentId.value)
  }

  async function recalculatePoints() {
    await tournamentSvc.recalculatePoints(tournamentId.value)
  }

  async function clearCache() {
    await tournamentSvc.clearCache(tournamentId.value)
  }

  async function ensureLeaderboard() {
    if (!tournamentId.value) return
    if (!rankedLeaderboard.value.length) {
      await rankedSvc.loadLeaderboard(tournamentId.value)
    }
  }

  // MMR only exists in ranked seasons: without the mode guard the profile tab fires
  // ranked endpoints against a championship id, which 404s on a good day and reads as
  // a ranked call on a non-ranked competition on any other.
  async function ensurePlayerProfile() {
    if (!tournamentId.value || !appUser.value?.id) return
    if (tournament.value?.mode !== 'ranked') return
    if (!playerMmr.value) {
      const [chartHistory] = await Promise.all([
        rankedSvc.loadPlayerMmr(tournamentId.value, appUser.value.id),
        playerApi.getStats(appUser.value.id, { tournamentId: tournamentId.value })
          .then((s) => { playerStats.value = s }),
      ])
      profileChartHistory.value = chartHistory
    }
  }

  async function loadPlayerCareer() {
    if (!appUser.value?.id) return
    if (tournament.value?.mode !== 'ranked') return
    try {
      playerCareer.value = (await rankedApi.getPlayerCareer(appUser.value.id)).seasons
    } catch {
      playerCareer.value = []
    }
  }

  async function ensurePlayerCareer() {
    if (playerCareer.value !== null) return
    await loadPlayerCareer()
  }

  // The discipline this season is played under. Read off the career payload when it
  // covers the season, since that is the snapshot the aggregates are computed from;
  // the tournament's own discipline is the fallback.
  const currentDisciplineId = computed(() => {
    const current = playerCareer.value?.find((season) => season.seasonId === tournamentId.value)
    return (current ? current.discipline?.id : tournament.value?.disciplineId) ?? null
  })

  /** The player's all-time record on this discipline's ladder. */
  const playerCareerPeak = computed(() =>
    currentDisciplineId.value ? careerPeak(playerCareer.value ?? [], currentDisciplineId.value) : null,
  )

  /**
   * Whether the player has ever run this discipline's ladder. The career link opens a
   * page already filtered on that discipline, so without a single run there it leads
   * to an empty card — the common case for someone opening a season they never played.
   */
  const hasDisciplineCareer = computed(() => {
    const seasons = playerCareer.value ?? []
    if (!currentDisciplineId.value) return seasons.length > 0
    return seasons.some((season) => season.discipline?.id === currentDisciplineId.value)
  })

  async function ensureStats() {
    if (!tournamentId.value) return
    if (!tournamentStats.value) {
      await statsSvc.loadStats(tournamentId.value)
    }
  }

  async function loadWeeklyMmr() {
    await rankedSvc.loadWeeklyMmrLeaders(tournamentId.value)
    weeklyMmrWeekStart.value = getCurrentWeekStart().getTime()
  }

  // MMR only exists in ranked seasons, so the weekly ranking is fetched on demand
  // rather than bundled into the (cached, mode-agnostic) tournament stats payload.
  async function ensureWeeklyMmrLeaders() {
    if (!tournamentId.value || tournament.value?.mode !== 'ranked') return
    if (!weeklyMmrLeaders.value || weeklyMmrWeekStart.value !== getCurrentWeekStart().getTime()) {
      await loadWeeklyMmr()
    }
  }

  async function reloadWeeklyMmrLeaders() {
    if (!tournamentId.value || tournament.value?.mode !== 'ranked') return
    await loadWeeklyMmr()
  }

  async function reloadPlayerProfile() {
    if (!tournamentId.value || !appUser.value?.id) return
    if (tournament.value?.mode !== 'ranked') return
    const [chartHistory] = await Promise.all([
      rankedSvc.loadPlayerMmr(tournamentId.value, appUser.value.id),
      playerApi.getStats(appUser.value.id, { tournamentId: tournamentId.value })
        .then((s) => { playerStats.value = s }),
      // A rated match can break the all-time record, so the career is refreshed
      // with the profile rather than left on the value fetched at mount.
      playerCareer.value === null ? Promise.resolve() : loadPlayerCareer(),
    ])
    profileChartHistory.value = chartHistory
  }

  async function refreshSilently() {
    if (!tournamentId.value) return
    await backgroundRefresh.run(async () => {
      const promises: Promise<unknown>[] = [
        reloadTournament(),
        reloadParticipants(),
      ]
      if (tournament.value?.mode === 'ranked' && rankedLeaderboard.value.length) {
        promises.push(reloadLeaderboard())
      }
      if (playerMmr.value !== null) {
        promises.push(reloadPlayerProfile())
      }
      if (tournamentStats.value !== null) {
        promises.push(reloadStats())
      }
      if (weeklyMmrLeaders.value !== null) {
        promises.push(reloadWeeklyMmrLeaders())
      }
      await Promise.all(promises)
      matchesRefreshKey.value += 1
    })
  }

  /**
   * The season's numbers just moved server-side. Same fan-out as a silent refresh
   * minus the tournament row itself, and carrying the same indicator: this is the
   * most common way the data changes while someone is looking at it.
   */
  async function refreshAfterLeaderboardUpdate() {
    if (!tournamentId.value) return
    await backgroundRefresh.run(async () => {
      const promises: Promise<unknown>[] = [reloadLeaderboard()]
      if (playerMmr.value !== null) promises.push(reloadPlayerProfile())
      if (tournamentStats.value !== null) promises.push(reloadStats())
      if (weeklyMmrLeaders.value !== null) promises.push(reloadWeeklyMmrLeaders())
      await Promise.all(promises)
      // A finalization is exactly the moment a new match must show up in the list.
      matchesRefreshKey.value += 1
    })
  }

  async function reloadTournament() {
    if (!tournamentId.value) return
    await tournamentSvc.loadTournamentWithErrorHandling(tournamentId.value)
  }

  async function reloadStats() {
    if (!tournamentId.value) return
    await statsSvc.loadStats(tournamentId.value)
  }

  async function reloadLeaderboard() {
    if (!tournamentId.value) return
    await rankedSvc.loadLeaderboard(tournamentId.value)
  }

  async function loadProvisionalLeaderboard() {
    if (!tournamentId.value) return
    await rankedSvc.loadProvisionalLeaderboard(tournamentId.value)
  }

  async function loadSeasonMmrLeaderboard() {
    if (!tournamentId.value) return
    await rankedSvc.loadSeasonMmrLeaderboard(tournamentId.value)
  }

  return {
    // Identity
    tournamentId,
    // UI state
    isInitialLoading,
    joining,
    leaving,
    isRefreshing: backgroundRefresh.isRefreshing,
    justRefreshed: backgroundRefresh.justRefreshed,
    // Tournament
    tournament,
    error,
    tournamentDuration,
    // Participants
    participants,
    participantCount,
    loadingParticipants,
    // Ranked
    rankedLeaderboard,
    rankedProvisionalLeaderboard,
    rankedSeasonMmrLeaderboard,
    rankedTiers,
    rankedPlacementMatches,
    playerMmr,
    playerOpponentQuality,
    playerStats,
    rankedLoading,
    rankedProvisionalLoading,
    rankedSeasonMmrLoading,
    isLeaderboardRecalculating,
    matchesRefreshKey,
    profileChartHistory,
    playerCareer,
    playerCareerPeak,
    hasDisciplineCareer,
    currentDisciplineId,
    ensurePlayerCareer,
    playerLeaderboardRank,
    weeklyMmrLeaders,
    // Tournament stats
    tournamentStats,
    tournamentStatsLoading,
    statsError,
    // Computed permissions
    isParticipant,
    canJoinTournament,
    canLeaveTournament,
    canManageTournament,
    canCreateMatch,
    menuItems,
    // Auth pass-through
    isAuthenticated,
    appUser,
    // Actions
    initialize,
    joinTournament,
    leaveTournament,
    reloadParticipants,
    recalculatePoints,
    clearCache,
    ensureLeaderboard,
    ensurePlayerProfile,
    ensureStats,
    ensureWeeklyMmrLeaders,
    reloadWeeklyMmrLeaders,
    reloadTournament,
    reloadStats,
    reloadLeaderboard,
    reloadPlayerProfile,
    refreshSilently,
    refreshAfterLeaderboardUpdate,
    loadProvisionalLeaderboard,
    loadSeasonMmrLeaderboard,
  }
})
