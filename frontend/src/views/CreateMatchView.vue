<template>
  <div>
    <!-- One root element, comment included: <RouterView> wraps the route component in
         a <Transition mode="out-in">, which can only animate a single root node. A
         comment left beside the branches is a second root node in dev builds, where
         comments are kept — the leave transition then never completes and the next
         route never mounts.
         The wizard itself mounts only once its data is in: rendered any earlier, its
         player and team pickers are interactive and empty, which reads as "this
         tournament has nobody in it" rather than "not here yet". -->
    <MatchFormSkeleton v-if="isLoading" :variant="isMobile ? 'mobile' : 'desktop'" />

    <div v-else-if="loadError" class="max-w-2xl mx-auto p-4 sm:p-6 flex flex-col gap-4">
      <Message severity="error" :closable="false">{{ t('createMatchView.loadError') }}</Message>
      <div>
        <Button
          :label="t('createMatchView.retry')"
          icon="fas fa-rotate-right"
          outlined
          @click="loadForm"
        />
      </div>
    </div>

    <MatchFormStepperMobile
      v-else-if="isMobile"
      :tournament-id="tournamentId"
      :match-id="matchId"
      :bracket-locked="isBracketMatch"
      :result-only="isCorrection"
    />
    <MatchFormStepperDesktop
      v-else
      :tournament-id="tournamentId"
      :match-id="matchId"
      :bracket-locked="isBracketMatch"
      :result-only="isCorrection"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, provide, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { useAppToast } from '@/composables/useAppToast'
import { useViewport } from '@/composables/useViewport'
import MatchFormSkeleton from '@/components/match/MatchFormSkeleton.vue'
import MatchFormStepperMobile from '@/components/match/mobile/MatchFormStepperMobile.vue'
import MatchFormStepperDesktop from '@/components/match/MatchFormStepperDesktop.vue'
import {
  MATCH_FORM_KEY,
  type MatchFormState,
  type TournamentPlayer,
} from '@/composables/match/match-form.context'
import { useMatchService } from '@/composables/match/match.service'
import { useTournamentService } from '@/composables/tournament/tournament.service'
import { useTeamService } from '@/composables/team/team.service'
import { useParticipantService } from '@/composables/participant.service'
import { useAuth } from '@/composables/useAuth'
import { outcomeTypeApi } from '@/composables/outcome-type.api'
import { outcomeReasonApi } from '@/composables/outcome-reason.api'
import { disciplineApi } from '@/composables/discipline/discipline.api'
import { rankedApi } from '@/composables/ranked/ranked.api'
import type { PlayerStandings } from '@/composables/match/match-balance'
import type {
  ClientBaseTournament,
  ClientMatchDetail,
  MatchSideInput,
  OutcomeType,
  OutcomeReason,
} from '@skol-arena/shared'

const { t } = useI18n()
const route = useRoute()
const { isMobile } = useViewport()
const toast = useAppToast()

const tournamentId = route.params.tournamentId as string
const matchId = route.query.matchId as string | undefined
const sourceMatchId = route.query.sourceMatchId as string | undefined

const { playersMap, setPlayersMap, getMatch } = useMatchService()
const { loadTournamentWithErrorHandling } = useTournamentService()
const { teams, loadTeams } = useTeamService()
const { getTournamentParticipants, error: participantsError } = useParticipantService()
const { isAdmin, appUser } = useAuth()

const tournament = ref<ClientBaseTournament | null>(null)
const isBracketMatch = computed(() => tournament.value?.mode === 'bracket')
// A finalized match can only have its result corrected: date and line-up stay as played.
const isCorrection = ref(false)
const participants = ref<TournamentPlayer[]>([])
const outcomeTypes = ref<OutcomeType[]>([])
const outcomeReasons = ref<OutcomeReason[]>([])
const scoreInstructions = ref<string | null>(null)
// Starts `true`: the form is never usable on the first frame, and saying otherwise
// flashes an empty wizard before the skeleton takes over.
const isLoading = ref(true)
const loadError = ref(false)

const formState = ref<MatchFormState>({
  playedAt: null,
  sides: [{ position: 1 }, { position: 2 }],
  allPlayerIds: [],
  winnerPosition: null,
  scorePerSide: { 1: 0, 2: 0 },
  outcomeTypeId: null,
  outcomeReasonId: null,
})
const activeStep = ref('when')

// --- Balance preview -------------------------------------------------------
// A ranked match can be entered days late, so the line-up must be priced with
// the MMR the players held on the day they played. The snapshot is therefore
// fetched only once both inputs are settled: the date (step `when`) and the
// player list (step `participants` / `teams`). Entering `composition` or
// `result` is exactly that moment, and it also covers the two paths that skip
// the composition step — a 1v1, and a bracket-locked match going straight from
// `when` to `result`.
const standings = ref<PlayerStandings | null>(null)
// `${date}|${sorted ids}` of the loaded snapshot: navigating back and forth
// between steps must not refetch, but changing the date or the roster must.
const standingsKey = ref('')

async function loadStandings() {
  if (tournament.value?.mode !== 'ranked') return
  const playedAt = formState.value.playedAt
  const playerIds = formState.value.allPlayerIds
  if (!playedAt || playerIds.length < 2) return

  const key = `${playedAt.toISOString()}|${[...playerIds].sort().join(',')}`
  if (key === standingsKey.value) return

  try {
    const entries = await rankedApi.getMmrSnapshot(tournamentId, playerIds, playedAt)
    standings.value = Object.fromEntries(
      entries.map((e) => [e.playerId, { mmr: e.mmr, isPlacement: e.isPlacement }]),
    )
    standingsKey.value = key
  } catch {
    // The bar is a hint, not a prerequisite: a failed snapshot hides it and
    // leaves the wizard alone rather than raising an error over a preview.
    standings.value = null
    standingsKey.value = ''
  }
}

watch(activeStep, (step) => {
  if (step === 'composition' || step === 'result') void loadStandings()
})

watch(
  () => formState.value.playedAt,
  (date) => {
    if (!date) return
    if (date > new Date()) {
      formState.value.winnerPosition = null
      formState.value.scorePerSide = { 1: 0, 2: 0 }
      formState.value.outcomeTypeId = null
      formState.value.outcomeReasonId = null
    }
  },
)

/** Hydrates the form from the match being completed. */
function applyExistingMatch(match: ClientMatchDetail) {
  if (match.playedAt) formState.value.playedAt = match.playedAt

  const sides: MatchSideInput[] = match.sides.map((s) => ({
    position: s.position,
    playerIds: s.players.map((p) => p.id),
  }))
  formState.value.sides = sides
  formState.value.allPlayerIds = sides.flatMap((s) => s.playerIds ?? [])

  formState.value.scorePerSide = {}
  for (const s of match.sides) {
    formState.value.scorePerSide[s.position] = s.score ?? 0
  }

  if (match.outcomeTypeId) formState.value.outcomeTypeId = match.outcomeTypeId
  formState.value.outcomeReasonId = match.outcomeReasonId || null

  const winner = match.sides.find((s) => s.isWinner)
  formState.value.winnerPosition = winner ? winner.position : null

  isCorrection.value = match.status === 'finalized'
  if (['reported', 'pending_confirmation', 'finalized'].includes(match.status)) {
    activeStep.value = 'result'
  }
}

/** Hydrates the line-up from the match being replayed. */
function applyRematch(match: ClientMatchDetail) {
  const sides: MatchSideInput[] = match.sides.map((s) => ({
    position: s.position,
    playerIds: s.players.map((p) => p.id),
    teamId: s.teamId ?? undefined,
  }))
  formState.value.sides = sides
  formState.value.allPlayerIds = sides.flatMap((s) => s.playerIds ?? [])
}

/**
 * The match this form starts from, if any. Failing to load it is reported and
 * leaves an empty form rather than blocking the whole wizard: the user can still
 * enter the match by hand.
 */
async function fetchSourceMatch(): Promise<ClientMatchDetail | null> {
  const id = matchId ?? sourceMatchId
  if (!id) return null
  try {
    return await getMatch(id)
  } catch {
    toast.add({
      severity: 'error',
      summary: t('createMatchView.errorSummary'),
      detail: t('createMatchView.loadMatchError'),
      life: 3000,
    })
    return null
  }
}

async function loadOutcomeData() {
  const disciplineId = tournament.value?.disciplineId || undefined
  if (disciplineId) {
    const [types, discipline] = await Promise.all([
      outcomeTypeApi.list(disciplineId),
      disciplineApi.getById(disciplineId),
    ])
    outcomeTypes.value = types
    scoreInstructions.value = discipline.scoreInstructions ?? null
  } else {
    outcomeTypes.value = await outcomeTypeApi.list()
  }
  if (!formState.value.outcomeTypeId) {
    const def = outcomeTypes.value.find((t) => t.isDefault)
    if (def) formState.value.outcomeTypeId = def.id
  }
  if (formState.value.outcomeTypeId) {
    outcomeReasons.value = await outcomeReasonApi.list(formState.value.outcomeTypeId)
  }
}

/**
 * Everything the wizard needs before it can be shown. The independent requests go
 * out together — on a bad connection the difference between three round-trips and
 * six is the whole wait — but their results are applied in the original order,
 * which is what decides who ends up in `allPlayerIds`.
 */
async function loadForm() {
  isLoading.value = true
  loadError.value = false
  try {
    const [tournamentResult, rawParticipants, sourceMatch] = await Promise.all([
      loadTournamentWithErrorHandling(tournamentId),
      getTournamentParticipants(tournamentId),
      fetchSourceMatch(),
    ])

    tournament.value = tournamentResult
    // Both services report a failure by returning empty rather than throwing, so a
    // dead network would otherwise land as an empty-but-usable form.
    if (!tournamentResult || participantsError.value) {
      loadError.value = true
      return
    }

    // The players map and the participant list come from the same payload; the
    // tournament mode only decides whether teams are needed on top.
    setPlayersMap(rawParticipants)
    participants.value = rawParticipants.map((p) => ({
      id: p.userId,
      displayName: p.user.displayName,
    }))

    if (sourceMatch) {
      if (matchId) applyExistingMatch(sourceMatch)
      else applyRematch(sourceMatch)
    } else if (!isAdmin.value && appUser.value) {
      // Only on a blank form: hydrating from a match replaces `allPlayerIds`
      // wholesale, so pre-selecting oneself there has never had any effect.
      const userId = appUser.value.id
      if (participants.value.some((p) => p.id === userId)) {
        formState.value.allPlayerIds = [userId, ...formState.value.allPlayerIds]
      }
    }

    await Promise.all([
      tournament.value?.teamMode === 'static' ? loadTeams(tournamentId) : Promise.resolve(),
      loadOutcomeData(),
    ])
  } catch (err) {
    console.error('Erreur lors du chargement du formulaire de match:', err)
    loadError.value = true
  } finally {
    isLoading.value = false
  }
}

onMounted(loadForm)

provide(MATCH_FORM_KEY, {
  formState,
  activeStep,
  tournament,
  playersMap,
  teams,
  participants,
  outcomeTypes,
  outcomeReasons,
  scoreInstructions,
  isLoading,
  standings,
})
</script>
