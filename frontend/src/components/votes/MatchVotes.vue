<template>
  <!-- Closed: nothing left to do here, the MVP stays flagged on the scoreboard. -->
  <div v-if="votes?.isOpen && (fairPlayVotes || mvpVotes)" class="space-y-4">
    <MvpSection
      v-if="mvpVotes"
      :votes="mvpVotes"
      :players="players"
      :saving="saving"
      @cast="castMvp"
      @remove="removeMvp"
      @declare-spectator="declareSpectator"
      @withdraw-spectator="withdrawSpectator"
    />
    <FairPlaySection
      v-if="fairPlayVotes"
      :votes="fairPlayVotes"
      :players="players"
      :saving="saving"
      @cast="castFairPlay"
      @remove="removeFairPlay"
      @team-up="teamUp"
    />
    <output v-if="justSaved" class="block text-right text-xs text-primary">
      {{ t('matchVotes.saved') }}
    </output>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { MatchVotes } from '@skol-arena/shared/types/index'
import { useMatchVotes } from '@/composables/votes/votes.service'
import { onWsEvent } from '@/composables/notification/notification.socket'
import FairPlaySection from './FairPlaySection.vue'
import MvpSection from './MvpSection.vue'
import { playersById, type VotePlayer } from './vote-players'

/** Fair-play and MVP sections of the match page; renders nothing when both are off or voting closed. */
const props = defineProps<{
  matchId: string
  sides: { players: VotePlayer[] }[]
}>()

const emit = defineEmits<{ mvp: [playerIds: string[]] }>()

const { t } = useI18n()
const {
  votes,
  saving,
  savedAt,
  load,
  castFairPlay,
  removeFairPlay,
  teamUp,
  castMvp,
  removeMvp,
  declareSpectator,
  withdrawSpectator,
} = useMatchVotes()

watch(
  () => props.matchId,
  (id) => load(id),
  { immediate: true },
)

// Someone else voted MVP or declared themselves spectator: refetch our own view.
const offVotesWs = onWsEvent('match_votes_updated', (payload) => {
  if ((payload as { matchId?: string })?.matchId === props.matchId) void load(props.matchId)
})
onUnmounted(offVotesWs)

const players = computed(() => playersById(props.sides))

type WithFairPlay = MatchVotes & { fairPlay: NonNullable<MatchVotes['fairPlay']> }
type WithMvp = MatchVotes & { mvp: NonNullable<MatchVotes['mvp']> }
const fairPlayVotes = computed(() => (votes.value?.fairPlay ? (votes.value as WithFairPlay) : null))
const mvpVotes = computed(() => (votes.value?.mvp ? (votes.value as WithMvp) : null))

// "More options" on the vote card links to `#fair-play`: the panel only exists once the
// votes are loaded, after the router's own scroll, so bring it into view here, once.
const route = useRoute()
let scrolledToFairPlay = false
watch(fairPlayVotes, async (fairPlay) => {
  if (!fairPlay || scrolledToFairPlay || route.hash !== '#fair-play') return
  scrolledToFairPlay = true
  await nextTick()
  document.getElementById('fair-play')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
})
// The page flags the MVP on the scoreboard too, live with every vote.
watch(
  () => votes.value?.mvp?.mvpPlayerIds ?? [],
  (ids) => emit('mvp', ids),
  { immediate: true },
)

const justSaved = ref(false)
let savedTimer: ReturnType<typeof setTimeout> | undefined
watch(savedAt, () => {
  justSaved.value = true
  clearTimeout(savedTimer)
  savedTimer = setTimeout(() => (justSaved.value = false), 2000)
})

defineExpose({ reload: () => load(props.matchId) })
</script>
