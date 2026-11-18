<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="translate-y-4 opacity-0"
    leave-active-class="transition duration-150 ease-in"
    leave-to-class="translate-y-4 opacity-0"
  >
    <div
      v-if="visible && current"
      class="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-2xl border border-white/10 bg-slate-900/95 p-4 shadow-2xl backdrop-blur"
      role="dialog"
      :aria-label="t('votePrompt.label')"
      data-testid="vote-prompt"
      @pointerdown="touch"
      @focusin="touch"
    >
      <div class="flex items-start gap-3">
        <div class="min-w-0 flex-1 space-y-3">
          <p v-if="current.source === 'open' && step !== 'thanks'" class="text-xs text-muted" data-testid="vote-prompt-info">
            <span class="font-semibold text-white/90">{{ t('votePrompt.newMatch') }}</span>
            · {{ matchLine }}
          </p>

          <template v-if="step === 'mvp'">
            <p class="text-sm font-semibold text-white">{{ t('votePrompt.mvpQuestion') }}</p>
            <div class="flex flex-wrap items-center gap-2">
              <UButton
                v-for="id in prompt.mvpCandidateIds"
                :key="id"
                color="neutral"
                variant="outline"
                size="sm"
                :disabled="busy"
                :data-testid="`vote-prompt-mvp-${id}`"
                @click="pickMvp(id)"
              >
                <template #leading>
                  <PlayerAvatar :name="nameOf(id)" :player-id="id" size="xs" />
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

          <div v-else-if="step === 'fairPlay'" class="flex flex-wrap items-center gap-3">
            <p class="text-sm font-semibold text-white">{{ fairPlayQuestion }}</p>
            <UButton
              icon="i-fa7-solid:thumbs-up"
              :aria-label="t('matchVotes.fairPlay.up')"
              :disabled="busy"
              data-testid="vote-prompt-thumbs-up"
              @click="thumbsUp"
            />
          </div>

          <p v-else class="text-sm font-semibold text-primary" role="status">{{ t('votePrompt.thanks') }}</p>
        </div>

        <UButton
          icon="i-fa7-solid:xmark"
          color="neutral"
          variant="ghost"
          size="sm"
          :aria-label="t('common.close')"
          data-testid="vote-prompt-close"
          @click="end"
        />
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { votesApi } from '@/composables/votes/votes.api'
import { useVotePrompt } from '@/composables/votes/useVotePrompt'
import { screenTakenOver, waitForFreeScreen } from '@/composables/useScreenTakeover'
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import { playersById } from './vote-players'

/**
 * The post-match vote toast, MVP first then fair-play 👍. Never a 👎 here: a negative
 * vote stays a deliberate act on the match page. Closing it, or leaving it alone for
 * `idleMs`, ends it without a trace.
 */
const props = withDefaults(defineProps<{ idleMs?: number; settleMs?: number; thanksMs?: number }>(), {
  idleMs: 7000,
  settleMs: 800,
  thanksMs: 1500,
})

const { t } = useI18n()
const { current, offerPending, markShown, close } = useVotePrompt()

type Step = 'mvp' | 'fairPlay' | 'thanks'
const step = ref<Step>('mvp')
const busy = ref(false)
const settled = ref(false)

const prompt = computed(() => current.value!.prompt)
const players = computed(() => playersById(current.value?.prompt.sides ?? []))
const nameOf = (id: string) => players.value.get(id)?.displayName ?? '?'
const visible = computed(() => !!current.value && settled.value && !screenTakenOver.value)

const matchLine = computed(() => {
  const p = prompt.value
  const mine = p.sides.find((s) => s.position === p.myPosition)?.players ?? []
  const theirs = p.sides.find((s) => s.position !== p.myPosition)?.players ?? []
  const me = [t('votePrompt.you'), ...mine.filter((x) => x.id !== p.meId).map((x) => x.displayName)].join(' & ')
  const line = `${me} ${t('votePrompt.versus')} ${theirs.map((x) => x.displayName).join(' & ')}`
  if (p.winnerPosition == null) return line
  return `${line} · ${p.winnerPosition === p.myPosition ? t('votePrompt.win') : t('votePrompt.loss')}`
})

const fairPlayQuestion = computed(() =>
  prompt.value.fairPlayTargetIds.length > 1
    ? t('votePrompt.fairPlayTeamQuestion')
    : t('votePrompt.fairPlayQuestion', { name: nameOf(prompt.value.fairPlayTargetIds[0] ?? '') }),
)

// ── Inactivity ──────────────────────────────────────────────────────────
let idleTimer: ReturnType<typeof setTimeout> | undefined
function touch() {
  clearTimeout(idleTimer)
  if (visible.value && step.value !== 'thanks') idleTimer = setTimeout(end, props.idleMs)
}

// ── Flow ────────────────────────────────────────────────────────────────
function end() {
  clearTimeout(idleTimer)
  close()
}

function next() {
  if (step.value === 'mvp' && prompt.value.fairPlayTargetIds.length > 0) {
    step.value = 'fairPlay'
    touch()
    return
  }
  step.value = 'thanks'
  clearTimeout(idleTimer)
  setTimeout(end, props.thanksMs)
}

async function vote(call: () => Promise<unknown>) {
  busy.value = true
  try {
    await call()
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
  else end()
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
watch(
  () => current.value?.prompt.matchId,
  async (id) => {
    settled.value = false
    if (!id) return
    step.value = current.value!.prompt.mvpCandidateIds.length > 0 ? 'mvp' : 'fairPlay'
    await waitForFreeScreen(props.settleMs)
    settled.value = true
    void markShown()
  },
  { immediate: true },
)
// Paused while a full-screen moment covers it, re-armed when it comes back.
watch(visible, touch)

function onVisibility() {
  if (document.visibilityState === 'visible') void offerPending()
}
onMounted(() => {
  void offerPending()
  document.addEventListener('visibilitychange', onVisibility)
})
onUnmounted(() => {
  clearTimeout(idleTimer)
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>
