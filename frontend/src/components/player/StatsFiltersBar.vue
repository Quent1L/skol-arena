<template>
  <!-- Desktop: collapsible filter card -->
  <div class="hidden md:block bg-gray-800 rounded-2xl overflow-hidden">
    <!-- Summary bar -->
    <div class="flex items-center gap-3 px-4 py-3">
      <button
        class="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
        @click="showControls = !showControls"
      >
        <i class="fa fa-filter text-xs" />
        <span class="font-medium">{{ t('statsFiltersBar.filters') }}</span>
        <i :class="showControls ? 'fa fa-chevron-up' : 'fa fa-chevron-down'" class="text-xs" />
      </button>
      <div v-if="activeFilterCount > 0 && !showControls" class="flex items-center gap-2 flex-wrap">
        <UBadge
          v-for="chip in activeFilterChips"
          :key="chip.key"
          :label="chip.label"
          color="info"
          variant="soft"
        />
      </div>
      <UButton
        v-if="activeFilterCount > 0"
        color="neutral"
        variant="ghost"
        class="ml-auto"
        :label="t('statsFiltersBar.reset')"
        icon="i-fa7-solid:rotate-left"
        @click="resetAll"
        size="md"
      />
    </div>

    <!-- Expanded controls -->
    <div
      v-if="showControls"
      class="flex items-center flex-wrap gap-4 px-4 pb-4 pt-2 border-t border-gray-700/50"
    >
      <!-- Mode A: editable controls -->
      <template v-if="!isLocked">
        <div v-if="hasMultipleDisciplines" class="flex flex-col gap-1">
          <label
            for="sfb-discipline"
            class="text-xs font-bold text-gray-400 uppercase tracking-wide"
            >{{ t('statsFiltersBar.discipline') }}</label
          >
          <USelectMenu
            id="sfb-discipline"
            v-model="selectedDisciplineId"
            :items="disciplineOptions"
            value-key="value"
            :placeholder="t('statsFiltersBar.allOption')"
            :search-input="false"
            size="lg"
            :ui="{ content: 'min-w-fit' }"
            class="w-40"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label
            for="sfb-tournament"
            class="text-xs font-bold text-gray-400 uppercase tracking-wide"
            >{{ t('statsFiltersBar.tournament') }}</label
          >
          <USelectMenu
            id="sfb-tournament"
            v-model="selectedTournamentId"
            :items="tournamentOptions"
            value-key="value"
            :placeholder="t('statsFiltersBar.allOption')"
            :search-input="false"
            size="lg"
            :ui="{ content: 'min-w-fit' }"
            class="max-w-240"
          >
            <template #item-label="{ item }">
              <div class="flex items-center justify-between w-full gap-2">
                <span class="truncate">{{ item.label }}</span>
                <UBadge
                  v-if="item.mode"
                  :label="modeLabel(item.mode)"
                  :color="modeColor(item.mode)"
                  variant="soft"
                  class="shrink-0"
                />
              </div>
            </template>
          </USelectMenu>
        </div>
        <div class="flex flex-col gap-1">
          <span class="text-xs font-bold text-gray-400 uppercase tracking-wide">{{
            t('statsFiltersBar.mode')
          }}</span>
          <UTabs
            v-model="selectedModeTab"
            :items="tabItems(modeOptions)"
            :content="false"
            color="neutral"
            :ui="TABS_UI"
          />
        </div>
      </template>

      <!-- Mode B: tournament locked, read-only badges -->
      <template v-else>
        <div class="flex items-center gap-2 flex-wrap">
          <button
            class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-700/40 text-indigo-200 text-sm font-semibold hover:bg-indigo-700/60 transition-colors"
            @click="selectedTournamentId = undefined"
          >
            <i class="fa fa-xmark text-xs" />
            {{ selectedTournamentFull?.name }}
          </button>
          <span
            v-if="selectedTournamentFull?.disciplineName"
            class="px-2.5 py-1 rounded-lg bg-gray-700 text-gray-300 text-sm"
          >
            {{ selectedTournamentFull.disciplineName }}
          </span>
          <UBadge
            v-if="selectedTournamentFull?.mode"
            :label="modeLabel(selectedTournamentFull.mode)"
            :color="modeColor(selectedTournamentFull.mode)"
            variant="soft"
          />
        </div>
      </template>
    </div>
  </div>

  <!-- Mobile: drawer -->
  <UDrawer v-model:open="drawerVisible" :title="t('statsFiltersBar.filters')" :ui="{ content: 'max-h-[85vh]' }">
    <template #body>
    <div class="flex flex-col gap-5 pb-2">
      <!-- Mode A: editable draft controls -->
      <template v-if="!isDraftLocked">
        <div v-if="hasMultipleDisciplines" class="flex flex-col gap-1">
          <label for="sfb-draft-discipline" class="text-sm font-medium">{{
            t('statsFiltersBar.discipline')
          }}</label>
          <USelectMenu
            id="sfb-draft-discipline"
            v-model="draftDisciplineId"
            :items="disciplineOptions"
            value-key="value"
            :placeholder="t('statsFiltersBar.allOption')"
            :search-input="false"
            size="lg"
            :ui="{ content: 'min-w-fit' }"
            class="w-full"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label for="sfb-draft-tournament" class="text-sm font-medium">{{
            t('statsFiltersBar.tournament')
          }}</label>
          <USelectMenu
            id="sfb-draft-tournament"
            v-model="draftTournamentId"
            :items="mobileTournamentOptions"
            value-key="value"
            :placeholder="t('statsFiltersBar.allOption')"
            :search-input="false"
            size="lg"
            :ui="{ content: 'min-w-fit' }"
            class="w-full"
          >
            <template #item-label="{ item }">
              <div class="flex items-center justify-between w-full gap-2">
                <span class="truncate">{{ item.label }}</span>
                <UBadge
                  v-if="item.mode"
                  :label="modeLabel(item.mode)"
                  :color="modeColor(item.mode)"
                  variant="soft"
                  class="shrink-0"
                />
              </div>
            </template>
          </USelectMenu>
        </div>
        <div class="flex flex-col gap-1">
          <span class="text-sm font-medium">{{ t('statsFiltersBar.mode') }}</span>
          <UTabs
            v-model="draftModeTab"
            :items="tabItems(mobileModeOptions)"
            :content="false"
            color="neutral"
            class="w-full"
            :ui="TABS_UI"
          />
        </div>
      </template>

      <!-- Mode B: draft tournament locked -->
      <template v-else>
        <div class="flex items-center gap-2 flex-wrap">
          <button
            class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-700/40 text-indigo-200 text-sm font-semibold hover:bg-indigo-700/60 transition-colors"
            @click="draftTournamentId = undefined"
          >
            <i class="fa fa-xmark text-xs" />
            {{ draftTournamentFull?.name }}
          </button>
          <span
            v-if="draftTournamentFull?.disciplineName"
            class="px-2.5 py-1 rounded-lg bg-gray-700 text-gray-300 text-sm"
          >
            {{ draftTournamentFull.disciplineName }}
          </span>
          <UBadge
            v-if="draftTournamentFull?.mode"
            :label="modeLabel(draftTournamentFull.mode)"
            :color="modeColor(draftTournamentFull.mode)"
            variant="soft"
          />
        </div>
      </template>
    </div>
    </template>

    <template #footer>
      <div class="flex gap-3 pt-2">
        <UButton
          color="neutral"
          variant="soft"
          :label="t('statsFiltersBar.reset')"
          icon="i-fa7-solid:rotate-left"
          class="flex-1 justify-center"
          @click="resetDraft"
          size="lg"
        />
        <UButton
          :label="t('statsFiltersBar.apply')"
          icon="i-fa7-solid:check"
          class="flex-1 justify-center"
          @click="applyDraft"
          size="lg"
        />
      </div>
    </template>
  </UDrawer>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PlayerTournamentOption, PlayerStatsFilters } from '@skol-arena/shared'

const props = defineProps<{
  availableTournaments: PlayerTournamentOption[]
  allowedModes?: string[]
  disciplines?: { id: string; name: string }[]
  autoSelectDiscipline?: boolean
}>()

const filters = defineModel<PlayerStatsFilters>({ required: true })
const drawerVisible = defineModel<boolean>('drawerVisible', { default: false })

const { t } = useI18n()

// Desktop state (committed)
const selectedTournamentId = ref<string | undefined>(filters.value.tournamentId)
const selectedDisciplineId = ref<string | undefined>(filters.value.disciplineId)
const selectedMode = ref<string | undefined>(filters.value.tournamentMode)
const showControls = ref(false)

// Mobile draft state
const draftTournamentId = ref<string | undefined>()
const draftDisciplineId = ref<string | undefined>()
const draftMode = ref<string | undefined>()

const isLocked = computed(() => !!selectedTournamentId.value)
const isDraftLocked = computed(() => !!draftTournamentId.value)

// Discipline options: merge external disciplines prop + availableTournaments
const disciplineOptions = computed(() => {
  const seen = new Set<string>()
  const opts: { label: string; value: string | undefined }[] = [
    { label: t('statsFiltersBar.allOption'), value: undefined },
  ]
  if (props.disciplines) {
    for (const d of props.disciplines) {
      seen.add(d.id)
      opts.push({ label: d.name, value: d.id })
    }
  }
  for (const tour of props.availableTournaments) {
    if (tour.disciplineId && !seen.has(tour.disciplineId)) {
      seen.add(tour.disciplineId)
      opts.push({ label: tour.disciplineName ?? tour.disciplineId, value: tour.disciplineId })
    }
  }
  return opts
})

const hasMultipleDisciplines = computed(() => disciplineOptions.value.length > 1)

function buildTournamentOptions(disciplineId: string | undefined, mode: string | undefined) {
  let list = props.availableTournaments
  if (props.allowedModes?.length) list = list.filter((t) => props.allowedModes!.includes(t.mode))
  if (disciplineId) list = list.filter((t) => t.disciplineId === disciplineId)
  if (mode) list = list.filter((t) => t.mode === mode)
  return [
    { label: t('statsFiltersBar.allOption'), value: undefined, mode: undefined },
    ...list.map((tour) => ({ label: tour.name, value: tour.id, mode: tour.mode })),
  ]
}

const tournamentOptions = computed(() =>
  buildTournamentOptions(selectedDisciplineId.value, selectedMode.value),
)
const mobileTournamentOptions = computed(() =>
  buildTournamentOptions(draftDisciplineId.value, draftMode.value),
)

function buildModeOptions(disciplineId: string | undefined) {
  const allModes = [
    { label: t('statsFiltersBar.championship'), value: 'championship' },
    { label: t('statsFiltersBar.bracket'), value: 'bracket' },
    { label: t('statsFiltersBar.ranked'), value: 'ranked' },
  ]
  const restricted = props.allowedModes?.length
    ? allModes.filter((m) => props.allowedModes!.includes(m.value))
    : allModes
  const available = disciplineId
    ? new Set(
        props.availableTournaments.filter((t) => t.disciplineId === disciplineId).map((t) => t.mode),
      )
    : null
  return [
    { label: t('statsFiltersBar.allOption'), value: undefined },
    ...(available ? restricted.filter((m) => available.has(m.value)) : restricted),
  ]
}

const modeOptions = computed(() => buildModeOptions(selectedDisciplineId.value))
const mobileModeOptions = computed(() => buildModeOptions(draftDisciplineId.value))

const selectedTournamentFull = computed(() =>
  props.availableTournaments.find((t) => t.id === selectedTournamentId.value),
)
const draftTournamentFull = computed(() =>
  props.availableTournaments.find((t) => t.id === draftTournamentId.value),
)

function modeLabel(mode: string): string {
  if (mode === 'championship') return t('statsFiltersBar.championship')
  if (mode === 'bracket') return t('statsFiltersBar.bracket')
  if (mode === 'ranked') return t('statsFiltersBar.ranked')
  return mode
}

function modeColor(mode: string): 'info' | 'warning' | 'success' | 'neutral' {
  if (mode === 'championship') return 'info'
  if (mode === 'bracket') return 'warning'
  if (mode === 'ranked') return 'success'
  return 'neutral'
}

/** Tabs need a string value: "all" stands for the undefined mode of the filters. */
const ALL_MODES = 'all'
const TABS_UI = {
  list: 'bg-slate-950',
  indicator: 'bg-slate-700',
  trigger: 'data-[state=active]:text-highlighted',
}

function tabItems(options: { label: string; value: string | undefined }[]) {
  return options.map((o) => ({ label: o.label, value: o.value ?? ALL_MODES }))
}

function modeTab(mode: { value: string | undefined }) {
  return computed({
    get: () => mode.value ?? ALL_MODES,
    set: (value: string | number) => {
      mode.value = value === ALL_MODES ? undefined : String(value)
    },
  })
}

const selectedModeTab = modeTab(selectedMode)
const draftModeTab = modeTab(draftMode)

const activeFilterCount = computed(
  () =>
    [selectedTournamentId.value, selectedMode.value, selectedDisciplineId.value].filter(Boolean)
      .length,
)

const activeFilterChips = computed(() => {
  const chips: { key: string; label: string }[] = []
  if (selectedTournamentId.value) {
    const tour = props.availableTournaments.find((t) => t.id === selectedTournamentId.value)
    if (tour) chips.push({ key: 'tournament', label: tour.name })
  }
  if (selectedMode.value) chips.push({ key: 'mode', label: modeLabel(selectedMode.value) })
  if (selectedDisciplineId.value) {
    const opt = disciplineOptions.value.find((d) => d.value === selectedDisciplineId.value)
    if (opt) chips.push({ key: 'discipline', label: opt.label })
  }
  return chips
})

// Emit updated filters when committed state changes
watch([selectedTournamentId, selectedMode, selectedDisciplineId], ([tid, mode, did]) => {
  filters.value = tid
    ? { tournamentId: tid }
    : {
        ...(mode ? { tournamentMode: mode } : {}),
        ...(did ? { disciplineId: did } : {}),
      }
})

// Reset mode when discipline changes makes it unavailable (desktop)
watch(selectedDisciplineId, (did) => {
  if (!did || !selectedMode.value) return
  const modes = new Set(
    props.availableTournaments.filter((t) => t.disciplineId === did).map((t) => t.mode),
  )
  if (!modes.has(selectedMode.value)) selectedMode.value = undefined
})

// Reset mode when discipline changes makes it unavailable (mobile draft)
watch(draftDisciplineId, (did) => {
  if (!did || !draftMode.value) return
  const modes = new Set(
    props.availableTournaments.filter((t) => t.disciplineId === did).map((t) => t.mode),
  )
  if (!modes.has(draftMode.value)) draftMode.value = undefined
})

// Sync draft from committed state when drawer opens
watch(drawerVisible, (open) => {
  if (!open) return
  draftTournamentId.value = selectedTournamentId.value
  draftDisciplineId.value = selectedDisciplineId.value
  draftMode.value = selectedMode.value
})

// Auto-select discipline when only one is available (opt-in via autoSelectDiscipline prop)
watch(
  () => props.availableTournaments,
  (tournaments) => {
    if (!props.autoSelectDiscipline || selectedDisciplineId.value) return
    const uniqueDisciplines = [
      ...new Set(tournaments.filter((t) => t.disciplineId).map((t) => t.disciplineId!)),
    ]
    if (uniqueDisciplines.length === 1) {
      selectedDisciplineId.value = uniqueDisciplines[0]
    }
  },
)

function applyDraft() {
  selectedTournamentId.value = draftTournamentId.value
  selectedDisciplineId.value = draftDisciplineId.value
  selectedMode.value = draftMode.value
  drawerVisible.value = false
}

function resetDraft() {
  draftTournamentId.value = undefined
  draftDisciplineId.value = undefined
  draftMode.value = undefined
}

function resetAll() {
  selectedTournamentId.value = undefined
  selectedDisciplineId.value = undefined
  selectedMode.value = undefined
}

defineExpose({ activeFilterCount, resetAll })
</script>
