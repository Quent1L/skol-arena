<template>
  <div class="match-list">
    <!-- Filters row -->
    <div v-if="showFilters" class="mb-4 flex flex-wrap justify-between gap-2">
      <!-- "Mes matchs" + outcome chips -->
      <div class="flex items-center gap-2 overflow-x-auto no-scrollbar">
        <button
          v-if="!props.playerMode && props.currentPlayerId"
          @click="toggleMyMatches"
          class="flex items-center gap-1.5 px-4 py-1.5 rounded-full border whitespace-nowrap transition-all duration-150 active:scale-95 shrink-0 cursor-pointer"
          :class="
            myMatchesActive
              ? 'bg-primary border-primary text-primary-contrast'
              : 'bg-surface-800 border-surface-700/20 text-muted-color'
          "
        >
          <i class="fa fa-user text-xs"></i>
          <span class="font-label text-xs font-bold uppercase tracking-wider">{{ t('matchList.myMatches') }}</span>
        </button>

        <template v-if="myMatchesActive || props.playerMode">
          <button
            v-for="f in outcomeFilters"
            :key="f.value"
            @click="toggleOutcome(f.value)"
            class="flex items-center gap-1.5 px-4 py-1.5 rounded-full border whitespace-nowrap transition-all duration-150 active:scale-95 shrink-0 cursor-pointer"
            :class="
              activeOutcomes.has(f.value)
                ? 'bg-surface-600 border-surface-500 text-color'
                : 'bg-surface-800 border-surface-700/20 text-muted-color'
            "
          >
            <i :class="f.icon" class="text-xs"></i>
            <span class="font-label text-xs font-bold uppercase tracking-wider">{{ f.label }}</span>
          </button>
        </template>

        <button
          v-if="props.showDisputedFilter"
          @click="toggleDisputedOnly"
          class="flex items-center gap-1.5 px-4 py-1.5 rounded-full border whitespace-nowrap transition-all duration-150 active:scale-95 shrink-0 cursor-pointer"
          :class="
            disputedOnly
              ? 'bg-amber-500 border-amber-500 text-surface-950'
              : 'bg-surface-800 border-surface-700/20 text-muted-color'
          "
        >
          <i class="fa fa-gavel text-xs"></i>
          <span class="font-label text-xs font-bold uppercase tracking-wider">{{ t('matchList.disputedOnly') }}</span>
        </button>

        <button
          v-if="isAnyFilterActive"
          @click="resetFilters"
          class="flex items-center justify-center w-8 h-8 rounded-full border bg-surface-800 border-surface-700/20 text-muted-color hover:text-red-400 transition-all duration-150 active:scale-95 shrink-0 cursor-pointer"
          :title="t('matchList.resetFilters')"
        >
          <i class="fa fa-filter-circle-xmark text-xs"></i>
        </button>
      </div>

      <!-- Player filter -->
      <div v-if="props.players && props.players.length > 0">
        <!-- Desktop: AutoComplete with chips -->
        <div v-if="!isMobile" class="flex items-center gap-2">
          <AutoComplete
            v-model="selectedPlayers"
            :suggestions="suggestions"
            option-label="displayName"
            multiple
            :placeholder="t('matchList.filterByPlayerPlaceholder')"
            @complete="onSearch"
          />
        </div>

        <!-- Mobile: filter button + PlayerPickerDialog -->
        <div v-else>
          <Button text severity="secondary" size="small" @click="openMobileDialog()">
            <i class="fa fa-filter mr-2" />
            {{ t('matchList.filters') }}
            <span
              v-if="selectedPlayers.length > 0"
              class="ml-2 bg-primary text-primary-contrast rounded-full text-xs w-5 h-5 flex items-center justify-center"
            >
              {{ selectedPlayers.length }}
            </span>
          </Button>
          <!-- Mounted on the first open and kept afterwards, so its chunk is only
               fetched by someone who actually filters. -->
          <PlayerPickerDialog
            v-if="mobileDialogMounted"
            v-model:visible="showMobileDialog"
            :title="t('matchList.filterByPlayerTitle')"
            :players="props.players"
            :selected-ids="selectedPlayers.map((p) => p.id)"
            @update:selected-ids="onMobileSelection"
          />
        </div>
      </div>
    </div>

    <!-- Initial loading -->
    <div v-if="loading && matches.length === 0" class="flex justify-center py-6">
      <ProgressSpinner />
    </div>

    <div v-else>
      <div v-if="displayedMatches.length === 0" class="text-center py-6 text-muted-color">
        <i class="fa fa-clock text-4xl mb-4 block"></i>
        <p class="font-label text-sm">{{ t('matchList.noMatchFound') }}</p>
      </div>

      <!-- Match cards grid -->
      <div
        v-else
        ref="container"
        class="pr-1"
        :class="props.scrollMode === 'container' ? 'overflow-y-auto' : undefined"
        :style="props.scrollMode === 'container' ? 'max-height: calc(100vh - 200px)' : undefined"
      >
        <div :class="gridClass">
          <MatchCard
            v-for="match in displayedMatches"
            :key="match.id"
            :entry="match"
            :current-player-id="props.playerMode ? props.currentPlayerId : (myMatchesActive ? props.currentPlayerId : undefined)"
          />
        </div>

        <!-- Loading more. A background refresh borrows the same lock but is reported
             by the page-level indicator, not by a spinner at the end of the list. -->
        <div v-if="loading && !refreshing" class="flex justify-center py-4">
          <ProgressSpinner style="width: 28px; height: 28px" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { matchesSearch } from '@/utils/StringUtils'
import { useInfiniteScroll } from '@vueuse/core'
import { matchApi } from '@/composables/match/match.api'
import type { ClientMatchCard, MatchCardSide } from '@skol-arena/shared/types/index'
import { useViewport } from '@/composables/useViewport'
import { useMatchListFiltersStore } from '@/stores/matchListFilters.store'
import MatchCard from './match/MatchCard.vue'
// Only ever opened from the mobile filter bar, so it has no business in this chunk.
const PlayerPickerDialog = defineAsyncComponent(() => import('./match/mobile/PlayerPickerDialog.vue'))

const { t } = useI18n()

interface Player {
  id: string
  displayName: string
}

interface Props {
  tournamentId?: string
  playerId?: string
  currentPlayerId?: string
  players?: Player[]
  pageSize?: number
  bracketMode?: boolean
  allowDraw?: boolean
  playerMode?: boolean
  showDisputedFilter?: boolean
  /**
   * Where the list scrolls: 'container' clamps it to the viewport and scrolls inside itself,
   * 'window' lets it grow and hands the infinite scroll over to the page, 'none' caps it to
   * the first page with no further loading.
   */
  scrollMode?: 'container' | 'window' | 'none'
  gridClass?: string
  /**
   * Bumped by the owner when the matches may have moved server-side (a finalization
   * landing over the socket, a tab returning after a dropped connection). The list
   * refetches what is already on screen, keeping the reader's place.
   */
  refreshKey?: number
}

const props = withDefaults(defineProps<Props>(), {
  pageSize: 20,
  scrollMode: 'container',
  gridClass: 'grid grid-cols-1 md:grid-cols-2 gap-4',
})

const matches = ref<ClientMatchCard[]>([])
const total = ref(0)
const hasMore = ref(false)
const loading = ref(false)
// Refreshing in place, as opposed to paginating: same lock, different affordance.
const refreshing = ref(false)
const container = ref<HTMLElement | null>(null)
let offset = 0

const { isMobile } = useViewport()

const filtersStore = useMatchListFiltersStore()
const { myMatchesActive, selectedPlayers, activeOutcomes, disputedOnly } = storeToRefs(filtersStore)

type OutcomeFilter = 'WIN' | 'LOSS' | 'DRAW'

const suggestions = ref<Player[]>([])
const showMobileDialog = ref(false)
const mobileDialogMounted = ref(false)

function openMobileDialog() {
  mobileDialogMounted.value = true
  showMobileDialog.value = true
}

const outcomeFilters = computed(() => {
  const filters = [
    { value: 'WIN' as OutcomeFilter, label: t('matchList.outcome.win'), icon: 'fa fa-trophy' },
    { value: 'LOSS' as OutcomeFilter, label: t('matchList.outcome.loss'), icon: 'fa fa-times' },
  ]
  if (props.allowDraw !== false) {
    filters.push({ value: 'DRAW' as OutcomeFilter, label: t('matchList.outcome.draw'), icon: 'fa fa-minus' })
  }
  return filters
})

const contextKey = computed(() => {
  if (props.tournamentId) return `tournament:${props.tournamentId}`
  if (props.playerId) return `player:${props.playerId}`
  return 'global'
})

const showFilters = computed(
  () => props.currentPlayerId || (props.players && props.players.length > 0),
)

const isAnyFilterActive = computed(
  () =>
    myMatchesActive.value ||
    selectedPlayers.value.length > 0 ||
    activeOutcomes.value.size > 0 ||
    disputedOnly.value,
)

function toggleDisputedOnly() {
  disputedOnly.value = !disputedOnly.value
  loadMatches()
}

function toggleMyMatches() {
  myMatchesActive.value = !myMatchesActive.value
  if (!myMatchesActive.value) {
    activeOutcomes.value = new Set()
  }
  loadMatches()
}

function toggleOutcome(value: OutcomeFilter) {
  const next = new Set(activeOutcomes.value)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  activeOutcomes.value = next
}

function getOutcome(entry: ClientMatchCard): OutcomeFilter {
  if (entry.mmrDelta != null) {
    if (entry.mmrDelta > 0) return 'WIN'
    if (entry.mmrDelta < 0) return 'LOSS'
    return 'DRAW'
  }
  const mySide = entry.sides.find((s: MatchCardSide) =>
    s.players.some((p) => p.id === entry.playerId),
  )
  if (!mySide) return 'DRAW'
  if (mySide.isWinner) return 'WIN'
  const oppSide = entry.sides.find((s: MatchCardSide) => s !== mySide)
  if (oppSide?.isWinner) return 'LOSS'
  return 'DRAW'
}

const displayedMatches = computed(() => {
  if ((!myMatchesActive.value && !props.playerMode) || activeOutcomes.value.size === 0) return matches.value
  return matches.value.filter((m) => activeOutcomes.value.has(getOutcome(m)))
})

function onSearch(event: { query: string }) {
  const q = event.query
  suggestions.value = (props.players ?? [])
    .filter(
      (p) =>
        matchesSearch(p.displayName, q) &&
        !selectedPlayers.value.find((s) => s.id === p.id),
    )
    .slice(0, 8)
}

function onMobileSelection(ids: string[]) {
  selectedPlayers.value = (props.players ?? []).filter((p) => ids.includes(p.id))
}

function buildPlayerIds(): string | undefined {
  const ids = [
    props.playerId,
    myMatchesActive.value ? props.currentPlayerId : undefined,
    ...selectedPlayers.value.map((p) => p.id),
  ].filter(Boolean) as string[]
  return ids.length > 0 ? ids.join(',') : undefined
}

async function loadMatches(append = false) {
  if (!append) {
    matches.value = []
    offset = 0
    total.value = 0
    hasMore.value = false
  }

  loading.value = true
  try {
    const result = await matchApi.list({
      tournamentId: props.tournamentId,
      playerIds: buildPlayerIds(),
      status: disputedOnly.value ? 'disputed' : undefined,
      bracketMode: props.bracketMode ? 'true' : undefined,
      limit: props.pageSize,
      offset,
    })
    if (append) {
      matches.value = [...matches.value, ...result.data]
    } else {
      matches.value = result.data
    }
    offset += result.data.length
    total.value = result.total
    hasMore.value = result.hasMore
  } catch (err) {
    console.error('Erreur lors du chargement des matchs:', err)
  } finally {
    loading.value = false
  }
}

/**
 * Background refresh. `loadMatches()` would reset to the first page and throw away
 * however far the reader had scrolled, so this refetches exactly the range already
 * loaded and swaps it in.
 */
async function refreshMatches() {
  if (loading.value || !matches.value.length) return

  loading.value = true
  refreshing.value = true
  try {
    const result = await matchApi.list({
      tournamentId: props.tournamentId,
      playerIds: buildPlayerIds(),
      status: disputedOnly.value ? 'disputed' : undefined,
      bracketMode: props.bracketMode ? 'true' : undefined,
      limit: matches.value.length,
      offset: 0,
    })
    matches.value = result.data
    offset = result.data.length
    total.value = result.total
    hasMore.value = result.hasMore
  } catch (err) {
    console.error('Erreur lors du rafraîchissement des matchs:', err)
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

useInfiniteScroll(
  () => (props.scrollMode === 'window' ? window : container.value),
  async () => {
    await loadMatches(true)
  },
  {
    distance: 100,
    canLoadMore: () => hasMore.value && !loading.value && props.scrollMode !== 'none',
  },
)

function resetFilters() {
  filtersStore.reset()
  disputedOnly.value = false
  loadMatches()
}

watch(
  contextKey,
  (key) => {
    filtersStore.initContext(key)
    loadMatches()
  },
  { immediate: true },
)
watch(selectedPlayers, () => loadMatches())
watch(
  () => props.refreshKey,
  () => refreshMatches(),
)
</script>
