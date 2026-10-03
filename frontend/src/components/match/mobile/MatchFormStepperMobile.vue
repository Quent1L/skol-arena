<template>
  <div class="flex flex-col h-screen bg-surface-50 dark:bg-surface-900">
    <!-- Sticky header -->
    <div
      class="sticky top-0 z-10 bg-surface-0 dark:bg-surface-800 border-b dark:border-surface-700 px-4 py-3 flex items-center shadow-sm"
    >
      <Button icon="fas fa-arrow-left" text rounded class="mr-2" @click="goBack" />
      <h1 class="text-lg font-bold">
        {{
          isEditMode ? t('matchFormStepperMobile.titleEdit') : t('matchFormStepperMobile.titleNew')
        }}
      </h1>
    </div>

    <!-- Step progress indicator -->
    <div class="px-4 pt-3 pb-2 bg-surface-0 dark:bg-surface-800 border-b dark:border-surface-700">
      <div class="flex items-center">
        <template v-for="(step, idx) in visibleSteps" :key="step.value">
          <span
            :class="[
              'rounded-full border-2 w-9 h-9 inline-flex items-center justify-center flex-none transition-colors',
              activeStep === step.value
                ? 'bg-primary text-primary-contrast border-primary'
                : idx < activeStepIndex
                  ? 'bg-primary/10 border-primary text-primary'
                  : 'border-surface-300 dark:border-surface-600 text-surface-400',
            ]"
          >
            <i :class="[step.icon, 'text-sm']" />
          </span>
          <div
            v-if="idx < visibleSteps.length - 1"
            :class="[
              'flex-1 h-0.5 transition-colors',
              idx < activeStepIndex ? 'bg-primary' : 'bg-surface-300 dark:bg-surface-600',
            ]"
          />
        </template>
      </div>
    </div>

    <!-- Scrollable step content -->
    <div class="flex-1 overflow-y-auto px-4 pb-28">
      <div v-if="activeStep === 'when'" class="mt-4">
        <WhenStep
          ref="whenStepRef"
          v-model:played-at="formState.playedAt"
          :min-date="tournamentMinDate"
          :max-date="tournamentMaxDate"
          hide-navigation
          @next="goToStep('when', nextStepAfterWhen)"
        />
      </div>

      <div v-else-if="activeStep === 'participants'" class="mt-4">
        <ParticipantsStep
          ref="participantsStepRef"
          v-model:all-player-ids="formState.allPlayerIds"
          :tournament-id="tournamentId"
          :played-at="formState.playedAt"
          :match-id="matchId"
          :players="participants"
          hide-navigation
          @previous="activeStep = 'when'"
          @next="goToStepFromParticipants"
        />
      </div>

      <div v-else-if="activeStep === 'teams'" class="mt-4">
        <TeamsStep
          ref="teamsStepRef"
          v-model:sides="formState.sides"
          :tournament-id="tournamentId"
          :teams="teams"
          :played-at="formState.playedAt"
          :match-id="matchId"
          hide-navigation
          @previous="activeStep = 'when'"
          @next="goToStepAfterTeams"
        />
      </div>

      <div v-else-if="activeStep === 'composition'" class="mt-4">
        <CompositionStep
          ref="compositionStepRef"
          v-model:sides="formState.sides"
          v-model:all-player-ids="formState.allPlayerIds"
          :tournament-id="tournamentId"
          :player-names="playersMap"
          :played-at="formState.playedAt"
          :match-id="matchId"
          hide-navigation
          :standings="standings"
          :allow-draw="tournament?.allowDraw ?? false"
          :is-ranked="tournament?.mode === 'ranked'"
          @previous="activeStep = 'participants'"
          @next="goToStepAfterComposition"
        />
      </div>

      <div v-else-if="activeStep === 'result'" class="mt-4">
        <ResultStep
          v-model:sides="formState.sides"
          v-model:winner="formState.winnerPosition"
          v-model:outcome-type-id="formState.outcomeTypeId"
          v-model:outcome-reason-id="formState.outcomeReasonId"
          v-model:score-per-side="formState.scorePerSide"
          :tournament-id="tournamentId"
          :player-names="playersMap"
          :score-enabled="tournament?.scoreEnabled ?? true"
          :min-score="tournament?.minScore"
          :max-score="tournament?.maxScore"
          :loading="matchLoading"
          :initial-outcome-types="outcomeTypes"
          :initial-outcome-reasons="outcomeReasons"
          :initial-score-instructions="scoreInstructions"
          hide-navigation
          :allow-draw="tournament?.allowDraw ?? false"
          :standings="standings"
          :is-ranked="tournament?.mode === 'ranked'"
          @previous="goBackFromResult"
          @create="submitMatch"
        />
      </div>
    </div>

    <!-- Fixed full-width bottom action bar -->
    <div
      class="fixed bottom-0 left-0 right-0 px-4 py-3 bg-surface-0 dark:bg-surface-800 border-t dark:border-surface-700"
    >
      <!-- Steps before result -->
      <template v-if="activeStep !== 'result'">
        <div class="flex gap-3">
          <Button
            v-if="activeStep !== 'when'"
            severity="secondary"
            icon="fas fa-arrow-left"
            class="flex-none"
            @click="currentStepBack"
          />
          <Button
            v-if="isFutureDate && canSchedule && isLastStepBeforeResult"
            :label="t('matchFormStepperMobile.scheduleMatch')"
            icon="fas fa-calendar-check"
            :loading="matchLoading"
            class="flex-1"
            @click="submitMatch"
          />
          <Button
            v-else
            :label="t('matchFormStepperMobile.next')"
            icon="fas fa-arrow-right"
            icon-pos="right"
            :disabled="!canProceedStep"
            class="flex-1"
            @click="currentStepNext"
          />
        </div>
      </template>

      <!-- Result step -->
      <template v-else>
        <div class="flex gap-3">
          <Button
            :label="t('matchFormStepperMobile.back')"
            severity="secondary"
            icon="fas fa-arrow-left"
            class="flex-1"
            @click="goBackFromResult"
          />
          <Button
            :label="isEditMode ? t('common.update') : t('common.save')"
            icon="fas fa-check"
            :disabled="!canSubmit"
            :loading="matchLoading"
            class="flex-1"
            @click="submitMatch"
          />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { MATCH_FORM_KEY } from '@/composables/match/match-form.context'
import { useMatchService } from '@/composables/match/match.service'
import { useMatchDateBounds } from '@/composables/match/useMatchDateBounds'
import WhenStep from '@/components/match/steps/WhenStep.vue'
import ParticipantsStep from '@/components/match/steps/ParticipantsStep.vue'
import TeamsStep from '@/components/match/steps/TeamsStep.vue'
import CompositionStep from '@/components/match/steps/CompositionStep.vue'
import ResultStep from '@/components/match/steps/ResultStep.vue'
import type {
  ClientCreateMatchRequest,
  ClientUpdateMatchRequest,
} from '@skol-arena/shared/types/index'

interface Props {
  tournamentId: string
  matchId?: string
  bracketLocked?: boolean
}

const props = defineProps<Props>()
const router = useRouter()
const { t } = useI18n()

const {
  loading: matchLoading,
  createMatchWithNavigation,
  updateMatchWithNavigation,
} = useMatchService()

const isEditMode = computed(() => !!props.matchId)

const ctx = inject(MATCH_FORM_KEY)!
const formState = ctx.formState
const activeStep = ctx.activeStep
const tournament = ctx.tournament
const playersMap = ctx.playersMap
const teams = ctx.teams
const participants = ctx.participants
const outcomeTypes = ctx.outcomeTypes
const outcomeReasons = ctx.outcomeReasons
const scoreInstructions = ctx.scoreInstructions
const standings = ctx.standings

const isFlexMode = computed(() => tournament.value?.teamMode !== 'static')
const isStaticMode = computed(() => tournament.value?.teamMode === 'static')
const isFutureDate = computed(
  () => !!formState.value.playedAt && formState.value.playedAt > new Date(),
)
const needsComposition = computed(() => formState.value.allPlayerIds.length > 2)

const visibleSteps = computed(() => {
  const steps: { value: string; icon: string }[] = [{ value: 'when', icon: 'fas fa-calendar-alt' }]
  if (!props.bracketLocked && isFlexMode.value)
    steps.push({ value: 'participants', icon: 'fas fa-users' })
  if (!props.bracketLocked && isStaticMode.value)
    steps.push({ value: 'teams', icon: 'fas fa-layer-group' })
  if (!props.bracketLocked && isFlexMode.value && needsComposition.value)
    steps.push({ value: 'composition', icon: 'fas fa-shuffle' })
  if (!isFutureDate.value) steps.push({ value: 'result', icon: 'fas fa-trophy' })
  return steps
})

const activeStepIndex = computed(() =>
  visibleSteps.value.findIndex((s) => s.value === activeStep.value),
)

const canSchedule = computed(() => {
  if (isFlexMode.value) {
    return (
      formState.value.allPlayerIds.length >= 2 &&
      formState.value.sides.every((s) => (s.playerIds?.length ?? 0) > 0)
    )
  }
  return formState.value.sides.every((s) => !!s.teamId)
})

const { minDate: tournamentMinDate, maxDate: tournamentMaxDate } = useMatchDateBounds(tournament)

const nextStepAfterWhen = computed(() => {
  if (props.bracketLocked) return 'result'
  if (isStaticMode.value) return 'teams'
  return 'participants'
})

const isLastStepBeforeResult = computed(() => {
  if (props.bracketLocked) return activeStep.value === 'when'
  if (isStaticMode.value) return activeStep.value === 'teams'
  if (needsComposition.value) return activeStep.value === 'composition'
  return activeStep.value === 'participants'
})

const canProceedStep = computed(() => {
  switch (activeStep.value) {
    case 'when':
      return !!formState.value.playedAt
    case 'participants':
      return formState.value.allPlayerIds.length >= 2
    case 'teams':
      return formState.value.sides.every((s) => !!s.teamId)
    case 'composition':
      return formState.value.sides.every((s) => (s.playerIds?.length ?? 0) > 0)
    default:
      return true
  }
})

const canSubmit = computed(() => {
  if (formState.value.winnerPosition === null) return false
  if (tournament.value?.scoreEnabled === false) return true
  const inRange = (v: number) =>
    (tournament.value?.minScore == null || v >= tournament.value.minScore) &&
    (tournament.value?.maxScore == null || v <= tournament.value.maxScore)
  return formState.value.sides.every((s) => inRange(formState.value.scorePerSide[s.position] ?? 0))
})

// Step component refs for programmatic triggerNext
const whenStepRef = ref<InstanceType<typeof WhenStep>>()
const participantsStepRef = ref<InstanceType<typeof ParticipantsStep>>()
const teamsStepRef = ref<InstanceType<typeof TeamsStep>>()
const compositionStepRef = ref<InstanceType<typeof CompositionStep>>()

function goToStep(_from: string, to: string) {
  if (!formState.value.playedAt) return
  activeStep.value = to
}

function buildSidesFrom1v1() {
  const ids = formState.value.allPlayerIds
  formState.value.sides = [
    { position: 1, playerIds: [ids[0]] },
    { position: 2, playerIds: [ids[1]] },
  ]
}

function goToStepFromParticipants() {
  if (needsComposition.value) {
    activeStep.value = 'composition'
  } else {
    buildSidesFrom1v1()
    if (!isFutureDate.value) activeStep.value = 'result'
    // future date: stay at participants — canSchedule is now true, "Programmer le match" appears
  }
}

function goToStepAfterTeams() {
  if (!isFutureDate.value) activeStep.value = 'result'
  // future date: stay at teams — "Programmer le match" appears
}

function goToStepAfterComposition() {
  if (!isFutureDate.value) activeStep.value = 'result'
  // future date: stay at composition — "Programmer le match" appears
}

function goBackFromResult() {
  if (props.bracketLocked) {
    activeStep.value = 'when'
  } else if (isStaticMode.value) {
    activeStep.value = 'teams'
  } else if (needsComposition.value) {
    activeStep.value = 'composition'
  } else {
    activeStep.value = 'participants'
  }
}

function currentStepBack() {
  switch (activeStep.value) {
    case 'participants':
      activeStep.value = 'when'
      break
    case 'teams':
      activeStep.value = 'when'
      break
    case 'composition':
      activeStep.value = 'participants'
      break
    case 'result':
      goBackFromResult()
      break
  }
}

async function currentStepNext() {
  switch (activeStep.value) {
    case 'when':
      await whenStepRef.value?.triggerNext()
      break
    case 'participants':
      await participantsStepRef.value?.triggerNext()
      break
    case 'teams':
      await teamsStepRef.value?.triggerNext()
      break
    case 'composition':
      await compositionStepRef.value?.triggerNext()
      break
  }
}

function goBack() {
  if (activeStep.value === 'when') {
    router.back()
  } else {
    currentStepBack()
  }
}

async function submitMatch() {
  const isScheduled = isFutureDate.value
  const payload: ClientCreateMatchRequest = {
    tournamentId: props.tournamentId,
    sides: formState.value.sides,
    playedAt: formState.value.playedAt ?? new Date(),
    status: isScheduled ? 'scheduled' : 'reported',
    scoreA: isScheduled ? 0 : (formState.value.scorePerSide[1] ?? 0),
    scoreB: isScheduled ? 0 : (formState.value.scorePerSide[2] ?? 0),
    winnerPosition: isScheduled
      ? null
      : formState.value.winnerPosition === 0
        ? null
        : formState.value.winnerPosition,
    outcomeTypeId: isScheduled ? undefined : (formState.value.outcomeTypeId ?? undefined),
    outcomeReasonId: isScheduled ? undefined : (formState.value.outcomeReasonId ?? undefined),
  }

  if (isEditMode.value && props.matchId) {
    const updatePayload: ClientUpdateMatchRequest = {
      playedAt: payload.playedAt,
      status: payload.status,
      scoreA: payload.scoreA,
      scoreB: payload.scoreB,
      winnerPosition: payload.winnerPosition,
      outcomeTypeId: payload.outcomeTypeId,
      outcomeReasonId: payload.outcomeReasonId,
    }
    await updateMatchWithNavigation(
      props.matchId,
      updatePayload,
      props.tournamentId,
      tournament.value?.mode,
    )
  } else {
    await createMatchWithNavigation(payload, props.tournamentId, tournament.value?.mode)
  }
}
</script>
