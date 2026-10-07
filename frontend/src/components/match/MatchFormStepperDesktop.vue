<template>
  <div class="max-w-2xl mx-auto p-4 sm:p-6">
    <h1 class="text-2xl font-semibold mb-6">
      {{
        props.resultOnly
          ? t('matchFormStepperDesktop.correctResult')
          : isEditMode
            ? t('matchFormStepperDesktop.completeMatch')
            : t('matchFormStepperDesktop.createMatch')
      }}
    </h1>

    <Card>
      <template #content>
        <Stepper :value="activeStep" linear class="w-full">
          <!-- Custom step progress indicator -->
          <div class="flex items-center mb-6">
            <template v-for="(step, idx) in visibleSteps" :key="step.value">
              <button
                class="bg-transparent border-0 p-0 flex-none"
                :disabled="idx >= activeStepIndex"
                @click="idx < activeStepIndex && (activeStep = step.value)"
              >
                <span
                  :class="[
                    'rounded-full border-2 w-10 h-10 inline-flex items-center justify-center transition-colors',
                    activeStep === step.value
                      ? 'bg-primary text-primary-contrast border-primary'
                      : idx < activeStepIndex
                        ? 'bg-primary/10 border-primary text-primary cursor-pointer'
                        : 'border-surface-300 dark:border-surface-600 text-surface-400',
                  ]"
                >
                  <i :class="step.icon" />
                </span>
              </button>
              <div
                v-if="idx < visibleSteps.length - 1"
                :class="[
                  'flex-1 h-0.5 transition-colors',
                  idx < activeStepIndex ? 'bg-primary' : 'bg-surface-300 dark:bg-surface-600',
                ]"
              />
            </template>
          </div>

          <!-- Step 1: Quand -->
          <StepPanel value="when">
            <WhenStep
              v-model:played-at="formState.playedAt"
              :min-date="tournamentMinDate"
              :max-date="tournamentMaxDate"
              @next="goToStep('when', nextStepAfterWhen)"
            />
          </StepPanel>

          <!-- Step 2a: Participants (flex) -->
          <StepPanel v-if="isFlexMode" value="participants">
            <ParticipantsStep
              v-model:all-player-ids="formState.allPlayerIds"
              :tournament-id="props.tournamentId"
              :played-at="formState.playedAt"
              :match-id="props.matchId"
              :players="participants"
              :next-label="
                isFutureDate && isLastStepBeforeResult ? 'Programmer le match' : undefined
              "
              @previous="activeStep = 'when'"
              @next="goToStepFromParticipants"
            />
          </StepPanel>

          <!-- Step 2b: Teams (static) -->
          <StepPanel v-if="isStaticMode" value="teams">
            <h3 class="text-base font-semibold mb-4">
              {{ t('matchFormStepperDesktop.teamsStep') }}
            </h3>
            <TeamsStep
              v-model:sides="formState.sides"
              :tournament-id="props.tournamentId"
              :teams="teams"
              :played-at="formState.playedAt"
              :match-id="props.matchId"
              :next-label="isFutureDate ? 'Programmer le match' : undefined"
              @previous="activeStep = 'when'"
              @next="goToStepAfterTeams"
            />
          </StepPanel>

          <!-- Step 3: Composition (flex, >2 players) -->
          <StepPanel v-if="isFlexMode && needsComposition" value="composition">
            <CompositionStep
              v-model:sides="formState.sides"
              v-model:all-player-ids="formState.allPlayerIds"
              :tournament-id="props.tournamentId"
              :player-names="playersMap"
              :played-at="formState.playedAt"
              :match-id="props.matchId"
              :next-label="isFutureDate ? 'Programmer le match' : undefined"
              :standings="standings"
              :allow-draw="tournament?.allowDraw ?? false"
              :is-ranked="tournament?.mode === 'ranked'"
              @previous="activeStep = 'participants'"
              @next="goToStepAfterComposition"
            />
          </StepPanel>

          <!-- Step 4: Result -->
          <StepPanel value="result">
            <ResultStep
              v-model:sides="formState.sides"
              v-model:winner="formState.winnerPosition"
              v-model:outcome-type-id="formState.outcomeTypeId"
              v-model:outcome-reason-id="formState.outcomeReasonId"
              v-model:score-per-side="formState.scorePerSide"
              :tournament-id="props.tournamentId"
              :player-names="playersMap"
              :score-enabled="tournament?.scoreEnabled ?? true"
              :min-score="tournament?.minScore"
              :max-score="tournament?.maxScore"
              :loading="matchLoading"
              :initial-outcome-types="outcomeTypes"
              :initial-outcome-reasons="outcomeReasons"
              :initial-score-instructions="scoreInstructions"
              :allow-draw="tournament?.allowDraw ?? false"
              :standings="standings"
              :is-ranked="tournament?.mode === 'ranked'"
              :submit-label="isEditMode ? t('common.update') : undefined"
              @previous="goBackFromResult"
              @create="submitMatch"
            />
          </StepPanel>
        </Stepper>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
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
  /** Correction of a finalized match: only the result step is shown. */
  resultOnly?: boolean
}

const props = defineProps<Props>()

const { t } = useI18n()
const router = useRouter()

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
  if (props.resultOnly) return [{ value: 'result', icon: 'fas fa-trophy' }]
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
    if (isFutureDate.value) submitMatch()
    else activeStep.value = 'result'
  }
}

function goToStepAfterTeams() {
  if (isFutureDate.value) submitMatch()
  else activeStep.value = 'result'
}

function goToStepAfterComposition() {
  if (isFutureDate.value) submitMatch()
  else activeStep.value = 'result'
}

function goBackFromResult() {
  if (props.resultOnly) {
    router.back()
  } else if (props.bracketLocked) {
    activeStep.value = 'when'
  } else if (isStaticMode.value) {
    activeStep.value = 'teams'
  } else if (needsComposition.value) {
    activeStep.value = 'composition'
  } else {
    activeStep.value = 'participants'
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
