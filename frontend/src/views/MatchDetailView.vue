<template>
  <div class="match-detail-view mx-auto w-full max-w-4xl px-3 py-4 sm:px-6 sm:py-6">
    <!-- Skeleton mirrors the real layout so the page does not jump when data lands -->
    <div v-if="loading" class="space-y-4">
      <Skeleton height="2.5rem" class="rounded-xl!" />
      <Skeleton height="15rem" class="rounded-2xl!" />
      <Skeleton height="7rem" class="rounded-2xl!" />
    </div>

    <SurfacePanel v-else-if="error" tone="danger">
      <div class="flex flex-col items-center gap-4 py-6 text-center">
        <i class="fa fa-triangle-exclamation text-3xl text-match-loss" aria-hidden="true" />
        <p class="text-sm text-white/80">{{ error }}</p>
        <Button :label="t('matchDetailView.back')" icon="fa fa-arrow-left" severity="secondary" @click="goBack()" />
      </div>
    </SurfacePanel>

    <div v-else-if="match" class="space-y-4">
      <!-- Top bar: back, context, status, actions. One line at every width. -->
      <div
        class="sticky top-0 z-20 -mx-3 flex items-center gap-2 border-b border-surface-700/40 bg-gray-900/85 px-3 py-2 backdrop-blur-md sm:-mx-6 sm:px-6"
      >
        <Button
          icon="fa fa-arrow-left"
          severity="secondary"
          text
          rounded
          :aria-label="t('matchDetailView.back')"
          @click="goBack()"
        />

        <div class="min-w-0 flex-1">
          <div class="font-label truncate text-sm font-semibold text-white/80">
            {{ match.tournament?.name ?? t('matchDetailView.matchHeading') }}
          </div>
        </div>

        <div class="flex shrink-0 items-center gap-1.5">
          <span class="flex h-1.5 w-1.5 rounded-full" :class="statusDotClass(match.status)" />
          <span
            class="font-label text-[10px] font-bold uppercase tracking-tighter"
            :class="statusTextClass(match.status)"
          >
            {{ statusLabel(match.status) }}
          </span>
        </div>

        <OverflowMenuButton v-if="actionItems.length > 0" :items="actionItems" menu-id="match-actions-menu" />
      </div>

      <!-- Hero scoreboard -->
      <SurfacePanel class="reveal" :style="revealDelay(0)" :padded="false">
        <div class="relative overflow-hidden" :class="heroGlowClass">
          <i
            class="pointer-events-none absolute -right-4 -top-3 text-7xl text-white/[0.04]"
            :class="isFinalized ? 'fa fa-trophy' : 'fa fa-hourglass-half'"
            aria-hidden="true"
          />

          <div class="relative px-3 pt-3 sm:px-5 sm:pt-4">
            <div class="flex flex-wrap items-center gap-2">
              <span
                v-if="modeLabel"
                class="font-label rounded-full border border-surface-600/60 bg-surface-900/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-color"
              >
                {{ modeLabel }}
              </span>
              <span v-if="match.outcomeType" class="font-label text-[11px] text-muted-color">
                {{ match.outcomeType.name }}
              </span>
            </div>
          </div>

          <!-- Phone: the score takes its own full-width row so the two sides split the
               remaining width evenly and the names stay readable. From sm: the classic
               A | score | B duel. -->
          <div
            class="relative grid grid-cols-2 items-start gap-2 px-2 pb-4 pt-2 sm:grid-cols-[1fr_auto_1fr] sm:gap-6 sm:px-5 sm:pb-6"
          >
            <MatchSidePanel
              :side="sideA"
              :fallback-name="t('matchDetailView.teamA')"
              :mode="match.tournament?.mode"
              :is-finalized="isFinalized"
              :show-winner="hasReportedWinner"
              :confirmation-statuses="confirmationStatuses"
              :tournament-id="match.tournamentId"
              :dimmed="hasReportedWinner && sideB?.isWinner === true"
            />

            <!-- On a phone this cell is a full-width row above the two sides. A score
                 earns that row; a bare "VS" between two names already facing each other
                 does not, so it only appears from sm:. -->
            <div
              class="order-first col-span-2 flex-col items-center justify-center self-center pb-1 sm:order-none sm:col-span-1 sm:flex sm:pb-0"
              :class="showScore ? 'flex' : 'hidden'"
            >
              <div
                v-if="showScore"
                class="font-headline flex items-center gap-2 text-5xl font-black tabular-nums tracking-tighter sm:gap-4 sm:text-7xl"
              >
                <span :class="scoreClass(sideA)">{{ displayScoreA }}</span>
                <span class="h-8 w-px shrink-0 bg-surface-600/60 sm:h-14" aria-hidden="true" />
                <span :class="scoreClass(sideB)">{{ displayScoreB }}</span>
              </div>
              <div v-else class="font-headline text-2xl font-black tracking-tighter text-muted-color/40 sm:text-3xl">
                {{ t('matchCard.vs') }}
              </div>
            </div>

            <MatchSidePanel
              :side="sideB"
              :fallback-name="t('matchDetailView.teamB')"
              :mode="match.tournament?.mode"
              :is-finalized="isFinalized"
              :show-winner="hasReportedWinner"
              :confirmation-statuses="confirmationStatuses"
              :tournament-id="match.tournamentId"
              :dimmed="hasReportedWinner && sideA?.isWinner === true"
            />
          </div>
        </div>
      </SurfacePanel>

      <!-- Pre-match balance (ranked only) -->
      <SurfacePanel v-if="balance" class="reveal" :style="revealDelay(1)">
        <template #header>
          <SectionHeader icon="fa fa-scale-balanced" :title="t('matchBalance.titleBefore')" />
        </template>
        <MatchBalanceBar
          :balance="balance"
          :allow-draw="match.tournament?.allowDraw ?? false"
          hide-title
        />
      </SurfacePanel>

      <!-- Meta strip -->
      <SurfacePanel v-if="metaItems.length > 0" class="reveal" :style="revealDelay(2)">
        <div class="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <div v-for="item in metaItems" :key="item.label" class="min-w-0">
            <div class="font-label flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-color">
              <i :class="item.icon" class="w-3 text-center" aria-hidden="true" />
              {{ item.label }}
            </div>
            <div class="mt-0.5 truncate text-sm font-semibold text-white/90" :title="item.value">
              {{ item.value }}
            </div>
          </div>
        </div>
      </SurfacePanel>

      <!-- Both children are single-root with their own v-if, so a hidden one collapses to a
           comment node and does not leave a gap in the space-y rhythm. -->
      <MatchConfirmation
        class="reveal"
        :style="revealDelay(3)"
        :match="match"
        :current-user-id="currentUser?.id"
        :responding="responding"
        @respond="handleRespond"
        @edit-result="completeMatch"
      />

      <MatchMessageThread
        v-if="canSeeThread"
        class="reveal"
        :style="revealDelay(4)"
        :match-id="match.id"
        :can-post="canPostOnThread"
        :current-user-id="currentUser?.id"
        :current-user-name="currentUser?.displayName"
      />

      <!-- Admin actions -->
      <SurfacePanel
        v-if="canManageMatch && match.status !== 'finalized'"
        tone="warn"
        class="reveal"
        :style="revealDelay(5)"
      >
        <template #header>
          <SectionHeader
            icon="fa fa-shield-halved"
            :title="t('matchDetailView.adminActionsTitle')"
            accent-class="bg-amber-400"
          />
        </template>

        <div class="space-y-3">
          <p class="text-sm text-white/70">{{ t('matchDetailView.adminActionsDescription') }}</p>
          <div class="flex flex-wrap gap-3">
            <Button
              :label="t('matchDetailView.finalizeConsensus')"
              icon="fa fa-check"
              severity="success"
              @click="() => handleFinalize('consensus')"
            />
            <Button
              :label="t('matchDetailView.finalizeOverride')"
              icon="fa fa-gavel"
              severity="warn"
              @click="() => handleFinalize('admin_override')"
            />
          </div>
        </div>
      </SurfacePanel>

      <!-- Cancel confirmation dialog -->
      <Dialog
        v-model:visible="showCancelDialog"
        :header="t('matchDetailView.cancelMatch')"
        modal
        :closable="!cancelling"
        :style="{ maxWidth: '600px' }"
      >
        <p v-if="match.status === 'finalized'" class="mb-2 font-semibold text-amber-400">
          <i class="fa fa-triangle-exclamation mr-1" aria-hidden="true" />
          {{ t('matchDetailView.cancelFinalizedWarning') }}
        </p>
        <p class="text-white/70">{{ t('matchDetailView.cancelConfirmation') }}</p>
        <template #footer>
          <Button
            :label="t('matchDetailView.keepMatch')"
            severity="secondary"
            outlined
            :disabled="cancelling"
            @click="showCancelDialog = false"
          />
          <Button
            :label="t('matchDetailView.confirmCancel')"
            icon="fa fa-ban"
            severity="danger"
            :loading="cancelling"
            @click="handleCancel"
          />
        </template>
      </Dialog>

      <!-- MMR Reveal Animation (ranked matches only) -->
      <!-- Recap first: with >=2 queued events show the grouped card, not the
           single reveal (currentEvent is non-null whenever the queue is). -->
      <MmrRecapCard
        v-if="match.tournament?.mode === 'ranked' && animationQueue.showRecap.value"
        :events="animationQueue.queue.value"
        :tiers="rankedTiers"
        @close="animationQueue.dismissAll()"
      />
      <MmrRevealAnimation
        v-else-if="match.tournament?.mode === 'ranked' && animationQueue.currentEvent.value"
        :event="animationQueue.currentEvent.value"
        :tiers="rankedTiers"
        @close="animationQueue.acknowledgeCurrentEvent()"
      />
      <BadgeRevealAnimation
        v-else-if="match.tournament?.mode === 'ranked' && animationQueue.currentBadge.value"
        :badge="animationQueue.currentBadge.value"
        @close="animationQueue.acknowledgeCurrentBadge()"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMatchService } from '@/composables/match/match.service'
import { useAuth } from '@/composables/useAuth'
import { useViewport } from '@/composables/useViewport'
import type { MenuItem } from 'primevue/menuitem'
import type {
  ClientMatchDetail,
  MatchDetailSide,
  MatchFinalizationReason,
  MmrAnimationWsPayload,
  MmrRecapReadyPayload,
  BadgeAnimationWsPayload,
} from '@skol-arena/shared/types/index'
import {
  POST_FINALIZATION_DISPUTE_DAYS,
  getFinalizedAmendRights,
  hasOpposingPostDispute,
} from '@skol-arena/shared/types/index'
import MatchConfirmation from '@/components/match/MatchConfirmation.vue'
import MatchMessageThread from '@/components/match/MatchMessageThread.vue'
import MatchSidePanel from '@/components/match/MatchSidePanel.vue'
import MatchBalanceBar from '@/components/match/MatchBalanceBar.vue'
import { useRankedService } from '@/composables/ranked/ranked.service'
import MmrRevealAnimation from '@/components/ranked/MmrRevealAnimation.vue'
import MmrRecapCard from '@/components/ranked/MmrRecapCard.vue'
import BadgeRevealAnimation from '@/components/ranked/BadgeRevealAnimation.vue'
import OverflowMenuButton from '@/components/OverflowMenuButton.vue'
import SectionHeader from '@/components/ui/SectionHeader.vue'
import SurfacePanel from '@/components/ui/SurfacePanel.vue'
import { useMatchStatus } from '@/composables/match/match-status-style'
import { buildConfirmationStatusMap } from '@/composables/match/match-confirmation-status'
import { computeMatchBalance } from '@/composables/match/match-balance'
import type { PlayerStandings } from '@/composables/match/match-balance'
import { rankedApi } from '@/composables/ranked/ranked.api'
import { useCountUp } from '@/composables/ui/useCountUp'
import { useMMrAnimationQueue } from '@/composables/ranked/useMMrAnimationQueue'
import { onWsEvent } from '@/composables/notification/notification.socket'

const { t, locale } = useI18n()
const { isMobile } = useViewport()
const { statusLabel, statusDotClass, statusTextClass } = useMatchStatus()
const route = useRoute()
const router = useRouter()

function goBack() {
  if (window.history.state?.back) {
    router.back()
  } else if (match.value?.tournamentId) {
    router.push(`/tournaments/${match.value.tournamentId}`)
  } else {
    router.push('/')
  }
}
const { getMatch, respondToMatch, finalizeMatch, cancelMatch, subscribeToMatchUpdates } =
  useMatchService()
const { appUser } = useAuth()
// Tiers drive the reveal animation's icon, colours and progress bar. This view never
// loads the tournament, so they have to be fetched on their own.
const { tiers: rankedTiers, loadTiers } = useRankedService()

const match = ref<ClientMatchDetail | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const responding = ref(false)
const cancelling = ref(false)
const showCancelDialog = ref(false)

// animationQueue is a plain object (not reactive), so computed refs need .value in template
const animationQueue = useMMrAnimationQueue()
let offWs: (() => void) | null = null
let offBadgeWs: (() => void) | null = null
let offRecapWs: (() => void) | null = null
let offMatchWs: (() => void) | null = null

/**
 * A match that is not finalized can still move under the player's feet: an opponent
 * validates, disputes, or the author corrects the score. Listen while that is possible
 * and drop the socket once the result is settled.
 */
/**
 * A finalized match is not necessarily settled: while the dispute window is open a
 * contestation — or its withdrawal — can still land, and the page has to hear about it.
 */
function syncMatchSubscription() {
  const isLive =
    !!match.value && (match.value.status !== 'finalized' || isPostDisputeWindowOpen.value)

  if (!isLive) {
    offMatchWs?.()
    offMatchWs = null
    return
  }

  if (offMatchWs) return
  offMatchWs = subscribeToMatchUpdates(match.value!.id, () => {
    refreshMatch()
  })
}

async function refreshMatch() {
  if (!match.value) return
  try {
    match.value = await getMatch(match.value.id)
    syncMatchSubscription()
  } catch (err) {
    console.error('Error refreshing match:', err)
  }
}

function initAnimationIfRanked() {
  if (!match.value || match.value.tournament?.mode !== 'ranked' || !appUser.value) return
  const seasonId = match.value.tournamentId!
  loadTiers(seasonId)
  animationQueue.loadPending(seasonId)
  offWs = onWsEvent('mmr_animation', (data: MmrAnimationWsPayload) => {
    animationQueue.enqueue(data)
  })
  offBadgeWs = onWsEvent('badge_animation', (data: BadgeAnimationWsPayload) => {
    animationQueue.enqueueBadge(data)
  })
  // Bulk recalc/cancellation: refetch all pending at once → one grouped recap.
  offRecapWs = onWsEvent('mmr_recap_ready', (data: MmrRecapReadyPayload) => {
    if (data.tournamentId !== seasonId) return
    animationQueue.loadPending(seasonId)
  })
}

onUnmounted(() => {
  if (offWs) offWs()
  if (offBadgeWs) offBadgeWs()
  if (offRecapWs) offRecapWs()
  if (offMatchWs) offMatchWs()
})

const currentUser = computed(() => appUser.value)

const sideA = computed(() => match.value?.sides.find((s) => s.position === 1))
const sideB = computed(() => match.value?.sides.find((s) => s.position === 2))

const isFinalized = computed(() => match.value?.status === 'finalized')

/**
 * How the two sides compared *before* this match. The snapshot is taken at
 * `playedAt` with a strict cut-off, so the match's own result is excluded: the
 * bar shows the standing the season actually priced it against.
 */
const balanceStandings = ref<PlayerStandings | null>(null)

async function loadBalance() {
  const m = match.value
  if (!m || m.tournament?.mode !== 'ranked' || !m.playedAt) return
  const playerIds = m.sides.flatMap((s) => s.players.map((p) => p.id))
  if (playerIds.length < 2) return

  try {
    const entries = await rankedApi.getMmrSnapshot(m.tournamentId, playerIds, new Date(m.playedAt))
    balanceStandings.value = Object.fromEntries(
      entries.map((e) => [e.playerId, { mmr: e.mmr, isPlacement: e.isPlacement }]),
    )
  } catch {
    // Informational panel: it drops out rather than taking the page down.
    balanceStandings.value = null
  }
}

const balance = computed(() => {
  const a = sideA.value
  const b = sideB.value
  if (!a || !b) return null
  return computeMatchBalance(
    [a, b].map((s) => ({ position: s.position, playerIds: s.players.map((p) => p.id) })),
    balanceStandings.value,
  )
})

/**
 * A score does not always name the winner, so a participant asked to validate needs to
 * see who the reporter designated. That claim exists from the moment a result is
 * reported — only a scheduled or cancelled match has nothing to show.
 */
const hasReportedWinner = computed(
  () => !!match.value && match.value.status !== 'scheduled' && match.value.status !== 'cancelled',
)

/**
 * Who has validated is painted next to the names in the scoreboard, where the roster
 * already is. Left undefined outside a validation round so the panels render exactly as
 * they did before — no reserved slot, no empty column.
 */
const confirmationStatuses = computed(() => {
  const m = match.value
  if (!m || !['reported', 'disputed'].includes(m.status)) return undefined
  return buildConfirmationStatusMap(m)
})

const showScore = computed(() => match.value?.tournament?.scoreEnabled !== false)

const modeLabel = computed(() => {
  const mode = match.value?.tournament?.mode
  if (mode === 'championship') return t('tournamentCard.mode.championship')
  if (mode === 'ranked') return t('tournamentCard.mode.ranked')
  if (mode === 'bracket') return t('tournamentCard.mode.bracket')
  return ''
})

/**
 * The score is the payoff of the whole screen, so it counts up on a settled result to
 * pull the eye there. useCountUp already collapses to an instant jump under
 * prefers-reduced-motion.
 */
const scoreRevealActive = computed(() => isFinalized.value && showScore.value)
const { value: countA } = useCountUp(() => sideA.value?.score ?? 0, {
  durationMs: 900,
  active: scoreRevealActive,
})
const { value: countB } = useCountUp(() => sideB.value?.score ?? 0, {
  durationMs: 900,
  active: scoreRevealActive,
})

const displayScoreA = computed(() => (scoreRevealActive.value ? countA.value : (sideA.value?.score ?? 0)))
const displayScoreB = computed(() => (scoreRevealActive.value ? countB.value : (sideB.value?.score ?? 0)))

function scoreClass(side?: MatchDetailSide): string {
  if (!hasReportedWinner.value) return 'text-white/70'
  if (side?.isWinner) return 'text-match-win'
  return 'text-white/40'
}

const heroGlowClass = computed(() => {
  if (!isFinalized.value) return ''
  if (sideA.value?.isWinner) return 'hero-glow hero-glow-left'
  if (sideB.value?.isWinner) return 'hero-glow hero-glow-right'
  return ''
})

/** Sections fade in top to bottom, establishing the reading order once on load. */
function revealDelay(index: number): Record<string, string> {
  return { '--reveal-index': String(index) }
}

const canManageMatch = computed(() => {
  return appUser.value?.role === 'super_admin' || appUser.value?.role === 'tournament_admin'
})

const isParticipant = computed(() => {
  if (!match.value || !appUser.value) return false
  const uid = appUser.value.id
  return match.value.sides.some((s) => s.players.some((p) => p.id === uid))
})

const postFinalizationDisputes = computed(() => {
  if (!match.value) return []
  return (match.value.confirmations ?? []).filter((c) => c.isPostFinalization)
})

/**
 * Mirrors the window MatchConfirmation offers the players. Kept here too because the
 * page decides on its own whether it is still worth listening for updates.
 */
const isPostDisputeWindowOpen = computed(() => {
  if (!match.value || match.value.status !== 'finalized') return false

  const finalizedAt = match.value.result?.finalizedAt
  if (!finalizedAt) return false

  const deadline = new Date(finalizedAt)
  deadline.setDate(deadline.getDate() + POST_FINALIZATION_DISPUTE_DAYS)
  return deadline.getTime() > Date.now()
})

const postDisputerNames = computed(() =>
  postFinalizationDisputes.value
    .map((d) => d.player?.displayName || t('matchDetailView.unknownPlayer'))
    .join(', '),
)

/** Same rule as the server: organizers always, the author within their window. */
const finalizedAmendRights = computed(() => {
  if (!match.value || !appUser.value) return null
  return getFinalizedAmendRights(
    {
      status: match.value.status,
      mode: match.value.tournament?.mode,
      finalizationReason: match.value.result?.finalizationReason,
      finalizedAt: match.value.result?.finalizedAt,
      reportedBy: match.value.result?.reportedBy,
      hasOpenPostDispute: hasOpposingPostDispute(
        match.value.confirmations,
        match.value.sides,
        match.value.result?.reportedBy,
      ),
    },
    { userId: appUser.value.id, canManage: canManageMatch.value },
  )
})

const canCancelFinalizedMatch = computed(() => finalizedAmendRights.value?.canCancel ?? false)
const canCorrectFinalizedMatch = computed(() => finalizedAmendRights.value?.canCorrect ?? false)

const canCancelMatch = computed(() => {
  if (!match.value) return false
  if (match.value.status === 'cancelled' || match.value.tournament?.mode === 'bracket') return false
  if (match.value.status === 'finalized') return canCancelFinalizedMatch.value
  if (canManageMatch.value) return true
  if (!isParticipant.value) return false
  // A result the other side entered is contested, not cancelled: only its author withdraws it.
  const hasResult = match.value.status === 'reported' || match.value.status === 'disputed'
  return !hasResult || match.value.result?.reportedBy === appUser.value?.id
})

/**
 * The author keeps the pen until the match is finalized: correcting the entry is how a
 * disagreement is resolved, so it stays available on a contested match too. Once
 * finalized, only its result can still be corrected, under the amend rights.
 */
const canEditMatch = computed(() => {
  if (!match.value) return false
  if (match.value.status === 'finalized') return canCorrectFinalizedMatch.value
  if (match.value.status === 'cancelled') return false
  if (match.value.status === 'scheduled') {
    return isParticipant.value || canManageMatch.value
  }
  return canManageMatch.value || (isParticipant.value && isResultAuthor.value)
})

/**
 * The thread is private to the people involved: participants and organizers.
 */
const canSeeThread = computed(() => isParticipant.value || canManageMatch.value)

/**
 * Writing stays open for a week after finalization, matching the window during which a
 * result can still be disputed.
 */
const canPostOnThread = computed(() => {
  if (!canSeeThread.value || !match.value) return false
  if (match.value.status !== 'finalized') return true

  const finalizedAt = match.value.result?.finalizedAt
  if (!finalizedAt) return true

  const daysSince = (Date.now() - new Date(finalizedAt).getTime()) / (1000 * 60 * 60 * 24)
  return daysSince <= POST_FINALIZATION_DISPUTE_DAYS
})

const isResultAuthor = computed(() => {
  const userId = currentUser.value?.id
  if (!userId || !match.value) return false
  return match.value.result?.reportedBy === userId || match.value.createdBy === userId
})

const canRematchMatch = computed(() => {
  if (!match.value) return false
  if (match.value.tournament?.status === 'finished') return false
  if (match.value.tournament?.mode === 'bracket') return false
  return canManageMatch.value || isParticipant.value
})

/**
 * Three action buttons never fitted next to the back button on a phone. They live in an
 * overflow menu now, which keeps the top bar on one line at every width.
 */
const actionItems = computed<MenuItem[]>(() => {
  const items: MenuItem[] = []
  if (canEditMatch.value) {
    items.push({
      label: t(
        match.value?.status === 'finalized'
          ? 'matchDetailView.correctResult'
          : 'matchDetailView.completeMatch',
      ),
      icon: 'fa fa-pen',
      command: completeMatch,
    })
  }
  if (canRematchMatch.value) {
    items.push({
      label: t('matchDetailView.rematchMatch'),
      icon: 'fa fa-redo',
      command: rematchMatch,
    })
  }
  if (canCancelMatch.value) {
    items.push({
      label: t('matchDetailView.cancelMatch'),
      icon: 'fa fa-ban',
      command: () => {
        showCancelDialog.value = true
      },
    })
  }
  return items
})

/**
 * The label keys were written for an inline "Label : value" layout and carry a trailing
 * colon. The meta strip stacks the label above the value, where that colon reads as a typo.
 */
function metaLabel(key: string): string {
  return t(key).replace(/\s*:\s*$/, '')
}

const metaItems = computed<{ icon: string; label: string; value: string }[]>(() => {
  const m = match.value
  if (!m) return []

  const items: { icon: string; label: string; value: string }[] = [
    { icon: 'fa fa-calendar-day', label: metaLabel('matchDetailView.matchDate'), value: formatDate(m.playedAt) },
  ]

  if (m.creator) {
    items.push({
      icon: 'fa fa-user-pen',
      label: metaLabel('matchDetailView.enteredBy'),
      value: m.creator.displayName,
    })
  }
  if (m.result?.reportedAt) {
    items.push({
      icon: 'fa fa-pen-to-square',
      label: metaLabel('matchDetailView.reportedAt'),
      value: formatDate(m.result.reportedAt),
    })
  }
  if (m.outcomeType) {
    items.push({
      icon: 'fa fa-flag-checkered',
      label: metaLabel('matchDetailView.outcomeType'),
      value: m.outcomeType.name,
    })
  }
  if (m.outcomeReason) {
    items.push({
      icon: 'fa fa-circle-info',
      label: metaLabel('matchDetailView.outcomeReason'),
      value: m.outcomeReason.name,
    })
  }
  if (m.result?.finalizedAt) {
    items.push({
      icon: 'fa fa-lock',
      label: metaLabel('matchDetailView.finalizedAt'),
      value: formatDate(m.result.finalizedAt),
    })
  }
  if (postFinalizationDisputes.value.length > 0) {
    items.push({
      icon: 'fa fa-flag',
      label: metaLabel('matchDetailView.postDisputedBy'),
      value: postDisputerNames.value,
    })
  }
  if (m.result?.finalizationReason) {
    items.push({
      icon: 'fa fa-gavel',
      label: metaLabel('matchDetailView.finalization'),
      value:
        m.result.finalizationReason === 'trust_score'
          ? t('matchDetailView.trustScoreBy', {
              name: m.result.reporter?.displayName ?? t('matchDetailView.unknown'),
            })
          : getFinalizationReasonLabel(m.result.finalizationReason),
    })
  }

  return items
})

async function loadMatch() {
  try {
    loading.value = true
    error.value = null
    const matchId = route.params.id as string
    match.value = await getMatch(matchId)
    initAnimationIfRanked()
    syncMatchSubscription()
    void loadBalance()
  } catch (err) {
    console.error('Error loading match:', err)
    error.value = err instanceof Error ? err.message : t('matchDetailView.loadError')
  } finally {
    loading.value = false
  }
}

async function handleRespond(data: { type: 'agree' | 'dispute'; reason?: string }) {
  if (!match.value) return

  const wasDisputed =
    match.value.status === 'disputed' ||
    postFinalizationDisputes.value.some((d) => d.playerId === appUser.value?.id)

  try {
    responding.value = true
    match.value = await respondToMatch(
      match.value.id,
      {
        type: data.type,
        reason: data.reason,
      },
      {
        withdrawingDispute: wasDisputed && data.type === 'agree',
        postFinalization: match.value.status === 'finalized',
      },
    )
    syncMatchSubscription()
  } catch (err) {
    console.error('Error responding to match:', err)
  } finally {
    responding.value = false
  }
}

async function handleCancel() {
  if (!match.value) return

  try {
    cancelling.value = true

    await cancelMatch(match.value.id)
    match.value = await getMatch(match.value.id)
    syncMatchSubscription()
    showCancelDialog.value = false
  } catch (err) {
    console.error('Error cancelling match:', err)
  } finally {
    cancelling.value = false
  }
}

async function handleFinalize(reason: MatchFinalizationReason) {
  if (!match.value) return

  try {
    await finalizeMatch(match.value.id, {
      finalizationReason: reason,
    })
    match.value = await getMatch(match.value.id)
    syncMatchSubscription()
  } catch (err) {
    console.error('Error finalizing match:', err)
  }
}

function completeMatch() {
  if (!match.value || !match.value.tournamentId) return
  router.push(`/tournaments/${match.value.tournamentId}/create-match?matchId=${match.value.id}`)
}

function rematchMatch() {
  if (!match.value?.tournamentId) return
  router.push({
    path: `/tournaments/${match.value.tournamentId}/create-match`,
    query: { sourceMatchId: match.value.id },
  })
}

function getFinalizationReasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    consensus: t('matchDetailView.finalizationReason.consensus'),
    auto_validation: t('matchDetailView.finalizationReason.autoValidation'),
    admin_override: t('matchDetailView.finalizationReason.adminOverride'),
    trust_score: t('matchDetailView.finalizationReason.trustScore'),
  }
  return labels[reason] || reason
}

const LONG_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}

// The meta strip is two columns on a phone: a spelled-out month pushes the time out of view
const COMPACT_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
}

function formatDate(date?: Date | string) {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString(locale.value, isMobile.value ? COMPACT_DATE_FORMAT : LONG_DATE_FORMAT)
}

onMounted(() => {
  loadMatch()
})
</script>

<style scoped>
.match-detail-view {
  min-height: 100vh;
}

.hero-glow::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}

.hero-glow-left::before {
  background: radial-gradient(
    ellipse 60% 70% at 18% 45%,
    color-mix(in srgb, var(--color-match-win) 12%, transparent),
    transparent 70%
  );
}

.hero-glow-right::before {
  background: radial-gradient(
    ellipse 60% 70% at 82% 45%,
    color-mix(in srgb, var(--color-match-win) 12%, transparent),
    transparent 70%
  );
}

.reveal {
  animation: reveal-rise 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: calc(var(--reveal-index, 0) * 0.08s);
}

@keyframes reveal-rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .reveal {
    animation: none;
  }
}
</style>
