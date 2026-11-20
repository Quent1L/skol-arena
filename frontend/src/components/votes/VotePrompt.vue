<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="translate-y-4 opacity-0"
    leave-active-class="transition duration-150 ease-in"
    leave-to-class="translate-y-4 opacity-0"
  >
    <!-- Same structure and gauge as a Nuxt UI toast, but a violet accent ring sets it
         apart from the neutral system toasts — it asks something, it does not inform.
         Bottom-right and able to hold buttons: the app toaster is top-right and
         useAppToast drops non-error toasts on phones. -->
    <div
      v-if="visible && current"
      ref="cardRef"
      class="vote-prompt fixed inset-x-4 touch-none z-50 flex gap-2.5 overflow-hidden rounded-lg bg-default p-4 shadow-lg ring ring-primary/50 sm:left-auto sm:right-4 sm:w-96"
      :class="{ 'above-nav': hasBottomNav }"
      :style="swipeStyle"
      role="dialog"
      :aria-label="t('votePrompt.label')"
      data-testid="vote-prompt"
      @pointerdown="frozen = true"
      @focusin="frozen = true"
      @mouseenter="hovered = true"
      @mouseleave="hovered = false"
    >
      <UIcon
        :name="step === 'thanks' ? 'i-fa7-solid:circle-check' : 'i-fa7-solid:check-to-slot'"
        class="size-5 shrink-0 text-primary"
      />

      <div class="flex w-0 flex-1 flex-col gap-2">
        <!-- Right after entering a match, this card replaces the "match saved" toast. -->
        <p
          v-if="current.source === 'entry' && step !== 'thanks'"
          class="flex items-center gap-1.5 text-sm text-muted"
          data-testid="vote-prompt-saved"
        >
          <UIcon name="i-fa7-solid:check" class="size-3.5 text-success" />
          {{ t('votePrompt.matchSaved') }}
        </p>

        <template v-if="step === 'mvp'">
          <p class="text-sm font-medium text-highlighted">{{ t('votePrompt.mvpQuestion') }}</p>
          <div class="flex flex-wrap items-center gap-1.5">
            <UButton
              v-for="id in prompt.mvpCandidateIds"
              :key="id"
              color="neutral"
              variant="outline"
              size="md"
              :disabled="busy"
              :data-testid="`vote-prompt-mvp-${id}`"
              @click="pickMvp(id)"
            >
              <template #leading>
                <PlayerAvatar :name="nameOf(id)" :player-id="id" size="sm" />
              </template>
              {{ nameOf(id) }}
            </UButton>
            <UButton
              :label="t('votePrompt.skip')"
              variant="link"
              color="neutral"
              size="sm"
              data-testid="vote-prompt-skip"
              @click="skipMvp"
            />
          </div>
        </template>

        <template v-else-if="step === 'fairPlay'">
          <p class="text-sm font-medium text-highlighted">{{ fairPlayQuestion }}</p>
          <div class="flex flex-wrap items-center gap-1.5">
            <UButton
              icon="i-fa7-solid:thumbs-up"
              :label="t('matchVotes.fairPlay.up')"
              size="md"
              :disabled="busy"
              data-testid="vote-prompt-thumbs-up"
              @click="thumbsUp"
            />
            <UButton
              :label="t('votePrompt.moreOptions')"
              trailing-icon="i-fa7-solid:arrow-right"
              variant="link"
              color="neutral"
              size="sm"
              :to="`/matches/${prompt.matchId}`"
              data-testid="vote-prompt-more"
              @click="end('skipped')"
            />
          </div>
        </template>

        <output v-else class="block text-sm font-medium text-highlighted">{{
          t('votePrompt.thanks')
        }}</output>
      </div>

      <UButton
        icon="i-fa7-solid:xmark"
        color="neutral"
        variant="link"
        size="md"
        class="-mr-2 -mt-2 self-start"
        :aria-label="t('common.close')"
        data-testid="vote-prompt-close"
        @click="end('dismissed')"
      />

      <UProgress
        v-if="step !== 'thanks' && !engaged"
        :model-value="(remaining / duration) * 100"
        size="sm"
        class="absolute inset-x-0 bottom-0 motion-reduce:opacity-40"
        :ui="{ indicator: 'motion-reduce:transition-none' }"
        data-testid="vote-prompt-progress"
      />
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { VotePromptOutcome } from '@skol-arena/shared/types/index'
import { votesApi } from '@/composables/votes/votes.api'
import { useVotePrompt } from '@/composables/votes/useVotePrompt'
import { screenTakenOver, waitForFreeScreen } from '@/composables/useScreenTakeover'
import { onWsEvent } from '@/composables/notification/notification.socket'
import { useBottomNavPresence } from '@/composables/ui/useBottomNav'
import { useViewport } from '@/composables/useViewport'
import { useNow, useSwipe } from '@vueuse/core'
import { useRoute } from 'vue-router'
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import { playersById } from './vote-players'

/**
 * The post-match vote card, MVP first then fair-play 👍. Never a 👎 here: a negative
 * vote stays a deliberate act on the match page. Closing it, or leaving it alone for
 * `idleMs`, ends it without a trace.
 */
const props = withDefaults(
  defineProps<{
    /** Countdown per step; defaults to longer on phones, where reading comes before any tap. */
    idleMs?: number
    settleMs?: number
    thanksMs?: number
    notificationDelayMs?: number
  }>(),
  { idleMs: undefined, settleMs: 800, thanksMs: 1500, notificationDelayMs: 1500 },
)

const { t } = useI18n()
const hasBottomNav = useBottomNavPresence()
const { isMobile } = useViewport()
const { current, offerPending, markShown, finish } = useVotePrompt()

type Step = 'mvp' | 'fairPlay' | 'thanks'
const step = ref<Step>('mvp')
const busy = ref(false)
const settled = ref(false)

const prompt = computed(() => current.value!.prompt)
const players = computed(() => playersById(current.value?.prompt.sides ?? []))
const nameOf = (id: string) => players.value.get(id)?.displayName ?? '?'
// The card only shows on the page of the match's tournament, where the question makes
// sense. Elsewhere it waits — unrecorded — until the player opens that tournament, as
// long as the match is still recent enough to vote on it.
const TOURNAMENT_ROUTES = new Set(['tournament-detail', 'tournament-tab'])
const route = useRoute()
const now = useNow({ interval: 30_000 })
const onTournamentPage = computed(
  () =>
    TOURNAMENT_ROUTES.has(String(route.name ?? '')) &&
    route.params.id === current.value?.prompt.tournamentId,
)
const expired = computed(
  () => !!current.value && current.value.prompt.expiresAt.getTime() <= now.value.getTime(),
)
watch(expired, (isExpired) => isExpired && end('expired'))
const visible = computed(
  () =>
    !!current.value &&
    settled.value &&
    !screenTakenOver.value &&
    onTournamentPage.value &&
    !expired.value,
)

const fairPlayQuestion = computed(() =>
  prompt.value.fairPlayTargetIds.length > 1
    ? t('votePrompt.fairPlayTeamQuestion')
    : t('votePrompt.fairPlayQuestion', { name: nameOf(prompt.value.fairPlayTargetIds[0] ?? '') }),
)

// ── Inactivity ──────────────────────────────────────────────────────────
// Counts down like a Nuxt UI toast, and stops counting:
// - while hovered (desktop), or while a full-screen moment covers the card;
// - while the app is in the background — a text message must not eat the time left;
// - for good once a finger or the keyboard touches the card: the player is on it;
// - for good once the player moved past the first step: they answered, nothing to
//   rush any more, so the second step has no gauge at all.
const TICK_MS = 100
const duration = computed(() => props.idleMs ?? (isMobile.value ? 12_000 : 7_000))
const remaining = ref(duration.value)
const hovered = ref(false)
const frozen = ref(false)
const engaged = ref(false)
const pageVisible = ref(document.visibilityState !== 'hidden')
const running = computed(
  () =>
    visible.value &&
    pageVisible.value &&
    !hovered.value &&
    !frozen.value &&
    !engaged.value &&
    step.value !== 'thanks',
)
let ticker: ReturnType<typeof setInterval> | undefined

function restartGauge() {
  remaining.value = duration.value
  frozen.value = false
  engaged.value = false
}

watch(
  running,
  (on) => {
    clearInterval(ticker)
    if (!on) return
    ticker = setInterval(() => {
      remaining.value -= TICK_MS
      if (remaining.value <= 0) end('expired')
    }, TICK_MS)
  },
  { immediate: true },
)

// ── Swipe to dismiss ───────────────────────────────────────────────────
// The gauge is not the only way out: a sideways or downward swipe closes the card.
// `touch-none` on the card keeps a swipe from also scrolling the page underneath.
const SWIPE_DISMISS_PX = 80
const cardRef = ref<HTMLElement | null>(null)
const { isSwiping, lengthX } = useSwipe(cardRef, {
  threshold: 10,
  onSwipeEnd(_event, direction) {
    if (Math.abs(lengthX.value) > SWIPE_DISMISS_PX || direction === 'down') end('dismissed')
  },
})
const swipeStyle = computed(() =>
  isSwiping.value
    ? { transform: `translateX(${-lengthX.value}px)`, transition: 'none' }
    : undefined,
)

// ── Flow ────────────────────────────────────────────────────────────────
/** Whether a vote cast from this card went through: then it ended as `voted`, however closed. */
let votedAny = false

function end(outcome: VotePromptOutcome) {
  clearInterval(ticker)
  void finish(votedAny ? 'voted' : outcome)
}

function next() {
  if (step.value === 'mvp' && prompt.value.fairPlayTargetIds.length > 0) {
    step.value = 'fairPlay'
    engaged.value = true
    return
  }
  step.value = 'thanks'
  setTimeout(() => end('skipped'), props.thanksMs)
}

async function vote(call: () => Promise<unknown>) {
  busy.value = true
  try {
    await call()
    votedAny = true
  } catch {
    // A refused vote (window closed, limit) just moves on: the match page explains it.
  } finally {
    busy.value = false
  }
  next()
}

const pickMvp = (id: string) => vote(() => votesApi.castMvp(prompt.value.matchId, id))
function skipMvp() {
  if (prompt.value.fairPlayTargetIds.length > 0) next()
  else end('skipped')
}
function thumbsUp() {
  const { matchId, fairPlayTargetIds } = prompt.value
  return vote(() =>
    fairPlayTargetIds.length > 1
      ? votesApi.castFairPlayTeamUp(matchId)
      : votesApi.castFairPlay(matchId, fairPlayTargetIds[0]!, { value: 'up' }),
  )
}

// ── Lifecycle ───────────────────────────────────────────────────────────
// Settles again on every arrival on the tournament page: the page holds the screen while
// it finds out whether an MMR reveal is pending, and the card waits for it to be free
// rather than flash in just before the reveal.
let settleRun = 0
async function settle() {
  const run = ++settleRun
  settled.value = false
  if (!current.value || !onTournamentPage.value) return
  await waitForFreeScreen(props.settleMs)
  if (run === settleRun) settled.value = true
}

watch(
  () => current.value?.prompt.matchId,
  (id) => {
    votedAny = false
    if (id) step.value = current.value!.prompt.mvpCandidateIds.length > 0 ? 'mvp' : 'fairPlay'
    void settle()
  },
  { immediate: true },
)
watch(onTournamentPage, () => void settle())

// "Shown" means on screen, not merely loaded: a prompt waiting for its tournament page
// can still be offered later.
let shownMatchId: string | null = null
watch(visible, (isVisible) => {
  const id = current.value?.prompt.matchId ?? null
  if (!isVisible || !id || id === shownMatchId) return
  shownMatchId = id
  restartGauge()
  markShown()
})

function onVisibility() {
  pageVisible.value = document.visibilityState !== 'hidden'
  if (pageVisible.value) void offerPending()
}
// A match someone else just entered with this player: ask now, not at the next opening.
// Delayed a little so the match is readable and its other notifications have landed.
const MATCH_NOTIFICATIONS = new Set(['MATCH_CREATED', 'MATCH_VALIDATION'])
let notificationTimer: ReturnType<typeof setTimeout> | undefined
const offNotification = onWsEvent('new_notification', (payload) => {
  if (!MATCH_NOTIFICATIONS.has((payload as { type?: string })?.type ?? '')) return
  clearTimeout(notificationTimer)
  notificationTimer = setTimeout(() => void offerPending(), props.notificationDelayMs)
})
onMounted(() => {
  void offerPending()
  document.addEventListener('visibilitychange', onVisibility)
})
onUnmounted(() => {
  clearInterval(ticker)
  clearTimeout(notificationTimer)
  offNotification()
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<style scoped>
/* Clear of the home indicator; above a mobile bottom nav (same height contract as
   MobileBottomNav) so the player can keep navigating without answering. The extra
   1.75rem clears the "Create" button, which sticks out 14px above the nav. */
.vote-prompt {
  bottom: calc(1rem + env(safe-area-inset-bottom));
}

.vote-prompt.above-nav {
  bottom: calc(4rem + env(safe-area-inset-bottom) + 1.75rem);
}
</style>
