<template>
  <div class="max-w-3xl mx-auto px-3 sm:px-4 py-4 space-y-3">
    <!-- Header / pickers -->
    <div class="rounded-2xl bg-gray-800 px-4 py-4">
      <div class="flex items-center gap-2 mb-3">
        <Button icon="fa fa-arrow-left" severity="secondary" text @click="router.back()" />
        <h1 class="text-lg font-black text-white">{{ t('playerComparisonView.title') }}</h1>
        <div class="md:hidden ml-auto">
          <Button
            icon="fa fa-filter"
            severity="secondary"
            @click="showFilterDrawer = true"
            :badge="activeFilterCount > 0 ? String(activeFilterCount) : undefined"
            badge-severity="info"
          />
        </div>
      </div>

      <!-- Desktop: inline AutoComplete selects -->
      <template v-if="!isMobile">
        <div class="grid grid-cols-2 gap-3 mt-1">
          <div class="flex flex-col gap-1">
            <label for="player-a-search" class="text-xs font-bold text-gray-400 uppercase tracking-wide">{{ t('playerComparisonView.playerA') }}</label>
            <PlayerSearchSelect input-id="player-a-search" v-model="selectedA" :placeholder="t('playerComparisonView.searchPlaceholder')" />
          </div>
          <div class="flex flex-col gap-1">
            <label for="player-b-search" class="text-xs font-bold text-gray-400 uppercase tracking-wide">{{ t('playerComparisonView.playerB') }}</label>
            <PlayerSearchSelect input-id="player-b-search" v-model="selectedB" :placeholder="t('playerComparisonView.searchPlaceholder')" />
          </div>
        </div>
      </template>

      <!-- Mobile: display cards → full-screen picker -->
      <template v-else>
        <div class="flex items-center gap-3 mt-1">
          <button
            class="flex-1 flex flex-col items-center gap-1 p-3 rounded-xl bg-gray-700/50 active:bg-gray-700 transition-colors border border-gray-700/50 min-w-0"
            @click="pickerSlot = 'a'"
          >
            <PlayerAvatar :name="selectedA?.displayName ?? '?'" :player-id="selectedA?.id" size="md" shape="square" />
            <span class="text-sm font-bold text-white truncate max-w-full">{{
              selectedA?.displayName ?? t('playerComparisonView.playerA')
            }}</span>
            <span class="text-xs text-gray-500"><i class="fa fa-pen mr-1"></i>{{ t('playerComparisonView.modify') }}</span>
          </button>

          <span class="text-gray-600 font-black text-lg shrink-0">VS</span>

          <button
            class="flex-1 flex flex-col items-center gap-1 p-3 rounded-xl transition-colors border min-w-0"
            :class="
              selectedB
                ? 'bg-gray-700/50 active:bg-gray-700 border-gray-700/50'
                : 'bg-indigo-900/30 active:bg-indigo-900/50 border-indigo-700/50'
            "
            @click="pickerSlot = 'b'"
          >
            <PlayerAvatar :name="selectedB?.displayName ?? '?'" :player-id="selectedB?.id" size="md" shape="square" />
            <span class="text-sm font-bold text-white truncate max-w-full">{{
              selectedB?.displayName ?? t('playerComparisonView.choosePlaceholder')
            }}</span>
            <span class="text-xs text-gray-500"><i class="fa fa-pen mr-1"></i>{{ t('playerComparisonView.modify') }}</span>
          </button>
        </div>
      </template>

    </div>

    <StatsFiltersBar
      v-model="statsFilters"
      v-model:drawer-visible="showFilterDrawer"
      :available-tournaments="availableTournaments"
      :allowed-modes="COMPARISON_VALID_MODES"
      :disciplines="disciplines"
      auto-select-discipline
    />

    <!-- Mobile player picker (full-screen) -->
    <PlayerPickerDialog
      v-model:visible="pickerVisible"
      :title="pickerSlot === 'a' ? t('playerComparisonView.playerA') : t('playerComparisonView.playerB')"
      :search-fn="playerApi.search"
      :single="true"
      @select="onMobilePick"
    />

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-12">
      <ProgressSpinner />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="text-center py-8 text-red-400">{{ error }}</div>

    <!-- Comparison -->
    <template v-else-if="playerA && playerB">
      <!-- Confrontation directe -->
      <div class="rounded-2xl bg-gray-800 p-4">
        <div class="text-xs font-bold text-gray-400 uppercase tracking-wide text-center mb-3">
          <i class="fa fa-khanda mr-1"></i> {{ t('playerComparisonView.headToHeadTitle') }}
        </div>
        <div class="flex items-center justify-center gap-4 sm:gap-8">
          <div class="flex flex-col items-center gap-1 min-w-0">
            <PlayerAvatar :name="playerA.player.displayName" :player-id="playerA.player.id" size="lg" shape="square" />
            <span class="text-sm font-bold text-white truncate max-w-24">{{
              playerA.player.displayName
            }}</span>
          </div>
          <div class="text-center">
            <div class="text-3xl font-black tabular-nums">
              <span class="text-green-400">{{ headToHead?.playerAWins ?? 0 }}</span>
              <span class="text-gray-600 mx-1">-</span>
              <span v-if="(headToHead?.draws ?? 0) > 0" class="text-gray-400"
                >{{ headToHead?.draws }}<span class="text-gray-600 mx-1">-</span></span
              >
              <span class="text-red-400">{{ headToHead?.playerBWins ?? 0 }}</span>
            </div>
            <div class="text-xs text-gray-500 mt-1">
              {{ headToHead?.matchesPlayed ?? 0 }} match{{
                (headToHead?.matchesPlayed ?? 0) > 1 ? 's' : ''
              }}
            </div>
          </div>
          <div class="flex flex-col items-center gap-1 min-w-0">
            <PlayerAvatar :name="playerB.player.displayName" :player-id="playerB.player.id" size="lg" shape="square" />
            <span class="text-sm font-bold text-white truncate max-w-24">{{
              playerB.player.displayName
            }}</span>
          </div>
        </div>

        <!-- 1v1 / team sub-breakdown -->
        <div v-if="(headToHead?.matchesPlayed ?? 0) > 0" class="mt-3 space-y-1">
          <div
            v-if="(headToHead?.solo?.matchesPlayed ?? 0) > 0"
            class="grid grid-cols-[4rem_1fr_4rem] items-center text-xs px-3 py-1.5 rounded-lg bg-gray-700/50"
          >
            <span class="text-gray-400"><i class="fa fa-user mr-1"></i> {{ t('playerComparisonView.solo') }}</span>
            <span class="tabular-nums font-bold text-center">
              <span class="text-green-400">{{ headToHead!.solo.playerAWins }}</span>
              <span class="text-gray-600 mx-1">-</span>
              <span v-if="headToHead!.solo.draws > 0" class="text-gray-400">{{ headToHead!.solo.draws }}<span class="text-gray-600 mx-1">-</span></span>
              <span class="text-red-400">{{ headToHead!.solo.playerBWins }}</span>
            </span>
            <span class="text-gray-500 text-right">{{ headToHead!.solo.matchesPlayed }} m</span>
          </div>
          <div
            v-if="(headToHead?.team?.matchesPlayed ?? 0) > 0"
            class="grid grid-cols-[4rem_1fr_4rem] items-center text-xs px-3 py-1.5 rounded-lg bg-gray-700/50"
          >
            <span class="text-gray-400"><i class="fa fa-users mr-1"></i> {{ t('playerComparisonView.teamLabel') }}</span>
            <span class="tabular-nums font-bold text-center">
              <span class="text-green-400">{{ headToHead!.team.playerAWins }}</span>
              <span class="text-gray-600 mx-1">-</span>
              <span v-if="headToHead!.team.draws > 0" class="text-gray-400">{{ headToHead!.team.draws }}<span class="text-gray-600 mx-1">-</span></span>
              <span class="text-red-400">{{ headToHead!.team.playerBWins }}</span>
            </span>
            <span class="text-gray-500 text-right">{{ headToHead!.team.matchesPlayed }} m</span>
          </div>
        </div>

        <p
          v-if="(headToHead?.matchesPlayed ?? 0) === 0"
          class="text-center text-sm text-gray-500 mt-3"
        >
          {{ t('playerComparisonView.neverFaced') }}
        </p>
      </div>

      <!-- As a team -->
      <div class="rounded-2xl bg-gray-800 p-4">
        <div class="text-xs font-bold text-gray-400 uppercase tracking-wide text-center mb-3">
          <i class="fa fa-people-group mr-1"></i> {{ t('playerComparisonView.togetherTitle') }}
        </div>
        <div class="flex items-center justify-center gap-4">
          <div class="flex items-center gap-1 shrink-0">
            <PlayerAvatar :name="playerA.player.displayName" :player-id="playerA.player.id" size="md" shape="square" />
            <span class="text-gray-500 text-xl font-black">+</span>
            <PlayerAvatar :name="playerB.player.displayName" :player-id="playerB.player.id" size="md" shape="square" />
          </div>
          <div class="text-center">
            <div class="text-2xl font-black tabular-nums">
              <span class="text-green-400">{{ together?.wins ?? 0 }}V</span>
              <span class="text-gray-600 mx-1">/</span>
              <span v-if="(together?.draws ?? 0) > 0" class="text-gray-400"
                >{{ together?.draws }}N<span class="text-gray-600 mx-1">/</span></span
              >
              <span class="text-red-400">{{ together?.losses ?? 0 }}D</span>
            </div>
            <div class="text-xs text-gray-500 mt-1">
              {{ together?.matchesPlayed ?? 0 }} match{{
                (together?.matchesPlayed ?? 0) > 1 ? 's' : ''
              }}
              <span v-if="(together?.matchesPlayed ?? 0) > 0"> · {{ together?.winRate }}%</span>
            </div>
          </div>
        </div>
        <p
          v-if="(together?.matchesPlayed ?? 0) === 0"
          class="text-center text-sm text-gray-500 mt-3"
        >
          {{ t('playerComparisonView.neverPlayedTogether') }}
        </p>
      </div>

      <!-- Common rivalries -->
      <div class="rounded-2xl bg-gray-800 p-4">
        <div class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">
          <i class="fa fa-users-rectangle mr-1"></i> {{ t('playerComparisonView.commonRivalries') }}
        </div>
        <p class="text-xs text-gray-500 mb-2">{{ t('playerComparisonView.commonRivalriesDesc') }}</p>
        <div
          class="grid grid-cols-3 items-center gap-2 pb-2 border-b border-gray-700 text-xs font-bold text-gray-400"
        >
          <span class="text-right truncate">{{ playerA.player.displayName }}</span>
          <span class="text-center">{{ t('playerComparisonView.opponent') }}</span>
          <span class="text-left truncate">{{ playerB.player.displayName }}</span>
        </div>
        <div
          v-for="row in commonRivalries"
          :key="row.opponentId"
          class="grid grid-cols-3 items-center gap-2 py-2 border-b border-gray-700/40 last:border-0"
        >
          <div class="text-right tabular-nums" :class="row.aBetter ? 'text-green-400' : 'text-white'">
            <div class="text-sm font-bold">{{ row.a.wins }}V · {{ row.a.losses }}D</div>
            <div class="text-xs text-gray-500">{{ row.a.winRate }}%</div>
          </div>
          <div class="flex flex-col items-center gap-0.5 min-w-0">
            <PlayerAvatar :name="row.displayName" :player-id="row.opponentId" size="sm" shape="square" />
            <span class="text-xs text-gray-300 truncate max-w-full">{{ row.displayName }}</span>
          </div>
          <div class="text-left tabular-nums" :class="row.bBetter ? 'text-green-400' : 'text-white'">
            <div class="text-sm font-bold">{{ row.b.wins }}V · {{ row.b.losses }}D</div>
            <div class="text-xs text-gray-500">{{ row.b.winRate }}%</div>
          </div>
        </div>
        <p v-if="commonRivalries.length === 0" class="text-center text-sm text-gray-500 py-3">
          {{ t('playerComparisonView.noCommonRival') }}
        </p>
      </div>

      <!-- Specialization by outcome type -->
      <div v-if="outcomeComparison.length" class="rounded-2xl bg-gray-800 p-4">
        <div class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">
          <i class="fa fa-chart-pie mr-1"></i> {{ t('playerComparisonView.outcomeSpecTitle') }}
        </div>
        <p class="text-xs text-gray-500 mb-2">{{ t('playerComparisonView.outcomeSpecDesc') }}</p>
        <div
          class="grid grid-cols-3 items-center gap-2 py-2 border-b border-gray-700/40 last:border-0"
          v-for="row in outcomeComparison"
          :key="row.id"
        >
          <div class="text-right tabular-nums" :class="row.aBetter ? 'text-green-400' : 'text-white'">
            <span class="text-base font-black">{{ row.aMatches > 0 ? row.aRate + '%' : '—' }}</span>
            <div class="text-xs text-gray-500">{{ row.aMatches }} m</div>
          </div>
          <div class="text-center text-xs font-bold text-gray-300 truncate">{{ row.name }}</div>
          <div class="text-left tabular-nums" :class="row.bBetter ? 'text-green-400' : 'text-white'">
            <span class="text-base font-black">{{ row.bMatches > 0 ? row.bRate + '%' : '—' }}</span>
            <div class="text-xs text-gray-500">{{ row.bMatches }} m</div>
          </div>
        </div>
      </div>
    </template>

    <!-- Empty prompt -->
    <div v-else class="text-center py-12 text-gray-500">
      <i class="fa fa-people-arrows text-4xl mb-4 block opacity-30"></i>
      <p v-if="!statsFilters.disciplineId && !statsFilters.tournamentId">{{ t('playerComparisonView.chooseDisciplineOrTournament') }}</p>
      <p v-else>{{ t('playerComparisonView.chooseTwoPlayers') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/useAuth'
import { useViewport } from '@/composables/useViewport'
import { usePlayerComparisonService } from '@/composables/player/player.comparison.service'
import { playerApi } from '@/composables/player/player.api'
import { disciplineApi } from '@/composables/discipline/discipline.api'
import type {
  PlayerProfile,
  PlayerStatsFilters,
  PlayerH2HStat,
  PlayerTournamentOption,
  Discipline,
} from '@skol-arena/shared'
import PlayerSearchSelect from '@/components/player/PlayerSearchSelect.vue'
import PlayerPickerDialog from '@/components/match/mobile/PlayerPickerDialog.vue'
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import StatsFiltersBar from '@/components/player/StatsFiltersBar.vue'
import Button from 'primevue/button'
import ProgressSpinner from 'primevue/progressspinner'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { appUser } = useAuth()
const { isMobile } = useViewport()
const { playerA, playerB, headToHead, together, loading, error, loadComparison, clearComparison } =
  usePlayerComparisonService()

const selectedA = ref<PlayerProfile | null>(null)
const selectedB = ref<PlayerProfile | null>(null)
const qDisciplineId = route.query.disciplineId as string | undefined
const qMode = route.query.mode as string | undefined
const qTournamentId = route.query.tournamentId as string | undefined
const statsFilters = ref<PlayerStatsFilters>({
  ...(qDisciplineId ? { disciplineId: qDisciplineId } : {}),
  ...(qMode ? { tournamentMode: qMode } : {}),
  ...(qTournamentId ? { tournamentId: qTournamentId } : {}),
})
const showFilterDrawer = ref(false)
const disciplines = ref<Discipline[]>([])
const availableTournaments = ref<PlayerTournamentOption[]>([])

const COMPARISON_VALID_MODES = ['championship', 'ranked']

const activeFilterCount = computed(
  () =>
    [
      statsFilters.value.tournamentId,
      statsFilters.value.tournamentMode,
      statsFilters.value.disciplineId,
    ].filter(Boolean).length,
)

const pickerSlot = ref<'a' | 'b' | null>(null)
const pickerVisible = computed({
  get: () => pickerSlot.value !== null,
  set: (v) => { if (!v) pickerSlot.value = null },
})

function onMobilePick(player: { id: string; displayName: string; shortName?: string }) {
  const profile: PlayerProfile = { id: player.id, displayName: player.displayName, shortName: player.shortName ?? '' }
  if (pickerSlot.value === 'a') selectedA.value = profile
  else selectedB.value = profile
  pickerSlot.value = null
}

// Opponents both players have faced, with each player's record vs that opponent
const commonRivalries = computed(() => {
  if (!playerA.value || !playerB.value) return []
  const aId = playerA.value.player.id
  const bId = playerB.value.player.id
  const bMap = new Map(playerB.value.stats.h2hStats.map((s) => [s.opponentId, s]))
  const rows: Array<{
    opponentId: string
    displayName: string
    shortName: string
    a: PlayerH2HStat
    b: PlayerH2HStat
    aBetter: boolean
    bBetter: boolean
  }> = []
  for (const a of playerA.value.stats.h2hStats) {
    if (a.opponentId === aId || a.opponentId === bId) continue
    const b = bMap.get(a.opponentId)
    if (!b) continue
    rows.push({
      opponentId: a.opponentId,
      displayName: a.displayName,
      shortName: a.shortName,
      a,
      b,
      aBetter: a.winRate > b.winRate,
      bBetter: b.winRate > a.winRate,
    })
  }
  return rows.sort((x, y) => y.a.matchesPlayed + y.b.matchesPlayed - (x.a.matchesPlayed + x.b.matchesPlayed))
})

// Win rate per outcome type, side by side
const outcomeComparison = computed(() => {
  if (!playerA.value || !playerB.value) return []
  const aMap = new Map(playerA.value.stats.outcomeTypeStats.map((s) => [s.outcomeTypeId, s]))
  const bMap = new Map(playerB.value.stats.outcomeTypeStats.map((s) => [s.outcomeTypeId, s]))
  const ids = new Set([...aMap.keys(), ...bMap.keys()])
  const rows = [...ids].map((id) => {
    const a = aMap.get(id)
    const b = bMap.get(id)
    const aMatches = a?.matchesPlayed ?? 0
    const bMatches = b?.matchesPlayed ?? 0
    const aRate = a?.winRate ?? 0
    const bRate = b?.winRate ?? 0
    const bothPlayed = aMatches > 0 && bMatches > 0
    return {
      id,
      name: a?.outcomeTypeName ?? b?.outcomeTypeName ?? id,
      aRate,
      bRate,
      aMatches,
      bMatches,
      aBetter: bothPlayed && aRate > bRate,
      bBetter: bothPlayed && bRate > aRate,
    }
  })
  return rows.sort((x, y) => y.aMatches + y.bMatches - (x.aMatches + x.bMatches))
})

function currentUserProfile(): PlayerProfile | null {
  const u = appUser.value
  return u ? { id: u.id, displayName: u.displayName, shortName: u.shortName } : null
}

watch(selectedA, async (a) => {
  availableTournaments.value = []
  if (a) {
    const result = await playerApi.getTournaments(a.id).catch(() => ({ tournaments: [] as PlayerTournamentOption[] }))
    availableTournaments.value = result.tournaments.filter((t) => t.teamMode === 'flex')
  }
})

watch([selectedA, selectedB, statsFilters], () => {
  if (!selectedA.value || !selectedB.value) return clearComparison()
  if (!statsFilters.value.disciplineId && !statsFilters.value.tournamentId) return clearComparison()
  router.replace({ query: { a: selectedA.value.id, b: selectedB.value.id } })
  loadComparison(selectedA.value.id, selectedB.value.id, statsFilters.value)
}, { deep: true })

onMounted(async () => {
  const qA = route.query.a as string | undefined
  const qB = route.query.b as string | undefined

  const disciplineList = await disciplineApi.list().catch(() => [] as Discipline[])
  disciplines.value = disciplineList

  if (!statsFilters.value.disciplineId && disciplineList.length === 1) {
    statsFilters.value = { ...statsFilters.value, disciplineId: disciplineList[0].id }
  }

  const aId = qA ?? appUser.value?.id
  if (aId && aId === appUser.value?.id) {
    selectedA.value = currentUserProfile()
  } else if (aId) {
    selectedA.value = await playerApi.getProfile(aId).catch(() => null)
  }

  if (qB) selectedB.value = await playerApi.getProfile(qB).catch(() => null)
})
</script>
