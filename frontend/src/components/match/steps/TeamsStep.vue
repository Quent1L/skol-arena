<template>
  <div class="flex flex-col gap-6 pt-4">
    <div v-for="(side, idx) in sidesModel" :key="side.position" class="flex flex-col gap-2">
      <label :for="`teams-side-${side.position}`" class="text-sm font-medium">
        {{ t('teamsStep.team', { number: idx + 1 }) }} <span class="text-red-500">*</span>
      </label>
      <USelectMenu
        :id="`teams-side-${side.position}`"
        :model-value="side.teamId ?? undefined"
        :items="availableTeamsFor(side.position)"
        value-key="id"
        label-key="name"
        :placeholder="t('teamsStep.selectTeam')"
        size="xl"
        class="w-full"
        @update:model-value="(val) => setTeam(side.position, val)"
      />
      <div v-if="side.teamId" class="flex flex-wrap gap-1 mt-1">
        <UBadge
          v-for="member in teamMembers(side.teamId)"
          :key="member.id"
          :label="member.user.displayName"
          color="neutral"
          variant="soft"
          class="rounded-full"
        />
      </div>
    </div>

    <div v-if="errors.length > 0" class="flex flex-col gap-2">
      <UAlert v-for="err in errors" :key="err" color="error" variant="subtle" :title="err" />
    </div>

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

function availableTeamsFor(position: number): ClientTeam[] {
  const otherTeamIds = sidesModel.value
    .filter((s) => s.position !== position && s.teamId)
    .map((s) => s.teamId!)
  return props.teams.filter((t) => !otherTeamIds.includes(t.id))
}

function teamMembers(teamId: string) {
  return props.teams.find((t) => t.id === teamId)?.members ?? []
}

function setTeam(position: number, teamId: string) {
  sidesModel.value = sidesModel.value.map((s) => (s.position === position ? { ...s, teamId } : s))
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
