<template>
  <div class="flex flex-col gap-6 pt-4">
    <h3 class="text-base font-semibold">{{ t('teamsStep.title') }}</h3>

    <div>
      <!-- Desktop: AutoComplete -->
      <UInputMenu
        v-if="!isMobile"
        v-model="pickedTeam"
        v-model:search-term="searchQuery"
        :items="filteredTeams"
        label-key="displayName"
        ignore-filter
        open-on-click
        :placeholder="t('teamsStep.searchPlaceholder')"
        :disabled="isFull"
        size="xl"
        class="w-full"
        @update:model-value="addTeam"
      >
        <template #item-leading="{ item }">
          <PlayerAvatar :name="item.displayName" size="sm" />
        </template>
        <template #item-label="{ item }">
          <div class="min-w-0">
            <div class="truncate">{{ item.displayName }}</div>
            <div class="text-xs text-muted truncate">{{ item.subtitle }}</div>
          </div>
        </template>
      </UInputMenu>

      <!-- Mobile: open picker dialog -->
      <UButton
        v-else
        :label="t('teamsStep.selectTeams')"
        icon="i-fa7-solid:users"
        variant="outline"
        size="xl"
        block
        @click="pickerVisible = true"
      />
    </div>

    <div v-if="selectedTeams.length > 0">
      <div class="text-sm font-medium mb-2">{{ t('teamsStep.selectedTeams') }}</div>
      <div class="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
        <div
          v-for="team in selectedTeams"
          :key="team.id"
          class="flex items-center pl-3 py-2 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 min-w-0"
        >
          <PlayerAvatar :name="team.displayName" size="sm" />
          <div class="flex-1 min-w-0 ml-2">
            <div class="text-sm truncate">{{ team.displayName }}</div>
            <div class="text-xs text-muted truncate">{{ team.subtitle }}</div>
          </div>
          <UButton
            color="error"
            variant="link"
            icon="i-fa7-solid:xmark"
            :aria-label="t('common.delete')"
            @click="removeTeam(team.id)"
          />
        </div>
      </div>
    </div>

    <div v-if="errors.length > 0" class="flex flex-col gap-2">
      <UAlert v-for="err in errors" :key="err" color="error" variant="subtle" :title="err" />
    </div>

    <PlayerPickerDialog
      v-model:visible="pickerVisible"
      :title="t('teamsStep.selectTeams')"
      :players="teamItems"
      :selected-ids="selectedTeamIds"
      :search-placeholder="t('teamsStep.searchPlaceholder')"
      :empty-text="t('teamsStep.noResults')"
      @update:selected-ids="assignTeams"
    />

    <div v-if="!hideNavigation" class="flex justify-between pt-2">
      <UButton
        :label="t('teamsStep.previous')"
        color="neutral"
        variant="ghost"
        size="lg"
        icon="i-fa7-solid:arrow-left"
        @click="emit('previous')"
      />
      <UButton
        :label="props.nextLabel ?? t('teamsStep.next')"
        :icon="props.nextLabel ? 'i-fa7-solid:calendar-check' : undefined"
        :trailing-icon="props.nextLabel ? undefined : 'i-fa7-solid:arrow-right'"
        size="lg"
        :loading="validating"
        :disabled="!canProceed"
        @click="onNext"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatchService } from '@/composables/match/match.service'
import { useViewport } from '@/composables/useViewport'
import { matchesSearch } from '@/utils/StringUtils'
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import PlayerPickerDialog from '@/components/match/mobile/PlayerPickerDialog.vue'
import type { ClientTeam, MatchSideInput } from '@skol-arena/shared/types/index'

interface Props {
  tournamentId: string
  teams: ClientTeam[]
  playedAt?: Date | null
  matchId?: string
  hideNavigation?: boolean
  nextLabel?: string
}

interface Emits {
  (e: 'previous'): void
  (e: 'next'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const { t } = useI18n()

const sidesModel = defineModel<MatchSideInput[]>('sides', { required: true })

const { validateMatchSides } = useMatchService()
const validating = ref(false)
const errors = ref<string[]>([])
const { isMobile } = useViewport()
const pickerVisible = ref(false)
const searchQuery = ref('')
/** Only a relay for the menu's selection: a pick is added, then cleared. */
const pickedTeam = ref<TeamItem | undefined>()

const PREVIEW_SIZE = 5

interface TeamItem {
  id: string
  displayName: string
  subtitle: string
}

const teamItems = computed<TeamItem[]>(() =>
  props.teams.map((team) => ({
    id: team.id,
    displayName: team.name,
    subtitle: membersPreview(team),
  })),
)

const selectedTeamIds = computed(() =>
  sidesModel.value.flatMap((s) => (s.teamId ? [s.teamId] : [])),
)

const selectedTeams = computed(() =>
  selectedTeamIds.value.flatMap((id) => teamItems.value.filter((t) => t.id === id)),
)

const isFull = computed(() => selectedTeamIds.value.length >= sidesModel.value.length)

const filteredTeams = computed(() =>
  teamItems.value.filter(
    (t) => matchesSearch(t.displayName, searchQuery.value) && !selectedTeamIds.value.includes(t.id),
  ),
)

/** First five players' names, then "+N" for the rest. */
function membersPreview(team: ClientTeam): string {
  const names = team.members.map((m) => m.user.displayName)
  const extra = names.length - PREVIEW_SIZE
  return names.slice(0, PREVIEW_SIZE).join(', ') + (extra > 0 ? ` +${extra}` : '')
}

/** Picked teams fill the sides in pick order; a pick beyond the last side is ignored. */
function assignTeams(ids: string[]) {
  if (ids.length > sidesModel.value.length) return
  sidesModel.value = sidesModel.value.map((s, i) => ({ ...s, teamId: ids[i] }))
}

function addTeam(team: TeamItem | undefined) {
  if (team && !selectedTeamIds.value.includes(team.id)) {
    assignTeams([...selectedTeamIds.value, team.id])
  }
  // After the menu has written its own label into the input.
  setTimeout(() => {
    pickedTeam.value = undefined
    searchQuery.value = ''
  }, 0)
}

function removeTeam(id: string) {
  assignTeams(selectedTeamIds.value.filter((t) => t !== id))
}

const canProceed = computed(() => {
  const filled = sidesModel.value.filter((s) => s.teamId)
  return (
    filled.length === sidesModel.value.length &&
    new Set(filled.map((s) => s.teamId)).size === filled.length
  )
})

defineExpose({ triggerNext: () => onNext() })

async function onNext() {
  errors.value = []
  validating.value = true
  try {
    const result = await validateMatchSides(
      props.tournamentId,
      sidesModel.value,
      props.playedAt ?? undefined,
      props.matchId,
    )
    if (!result.valid) {
      errors.value = result.errors
      return
    }
    emit('next')
  } finally {
    validating.value = false
  }
}
</script>
