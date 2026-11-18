<template>
  <SurfacePanel data-testid="mvp-section">
    <template #header>
      <div class="flex items-center justify-between gap-3">
        <SectionHeader icon="fa fa-medal" :title="t('matchVotes.mvp.title')" accent-class="bg-amber-400" />
        <span v-if="mvp.spectatorCount > 0" class="shrink-0 text-xs text-muted" data-testid="mvp-spectators">
          👀 {{ t('matchVotes.mvp.spectators', { count: mvp.spectatorCount }) }}
        </span>
      </div>
    </template>

    <div class="space-y-3">
      <p class="text-sm text-white/90" data-testid="mvp-result">
        <template v-if="mvp.mvpPlayerIds.length > 0">🏅 {{ mvpNames }}</template>
        <span v-else class="text-muted">{{ t('matchVotes.mvp.none') }}</span>
        <span v-if="timeLeft" class="text-muted" data-testid="mvp-time-left"> · {{ timeLeft }}</span>
      </p>

      <UButton
        v-if="canDeclare"
        :label="t('matchVotes.mvp.iWatched')"
        variant="soft"
        size="sm"
        :disabled="saving"
        data-testid="mvp-declare-spectator"
        @click="emit('declareSpectator')"
      >
        <template #leading>👀</template>
      </UButton>

      <div v-if="canVote" class="space-y-2">
        <p class="text-xs text-muted">{{ t('matchVotes.mvp.yourVote') }}</p>
        <div class="flex flex-wrap gap-2">
          <UButton
            v-for="id in mvp.candidateIds"
            :key="id"
            :color="mvp.myVote === id ? 'primary' : 'neutral'"
            :variant="mvp.myVote === id ? 'solid' : 'outline'"
            size="sm"
            :aria-pressed="mvp.myVote === id"
            :disabled="!votes.isOpen || saving || isBlocked(id)"
            :title="isBlocked(id) ? blockedLabel(id) : undefined"
            :data-testid="`mvp-candidate-${id}`"
            @click="toggle(id)"
          >
            <template #leading>
              <PlayerAvatar :name="players.get(id)?.displayName ?? '?'" :player-id="id" size="xs" />
            </template>
            {{ players.get(id)?.shortName || players.get(id)?.displayName }}
          </UButton>
        </div>
        <p v-for="id in blockedIds" :key="id" class="text-xs text-muted">{{ blockedLabel(id) }}</p>
        <UButton
          v-if="votes.role === 'spectator' && votes.isOpen"
          :label="t('matchVotes.mvp.withdrawSpectator')"
          variant="link"
          color="neutral"
          size="xs"
          :disabled="saving"
          data-testid="mvp-withdraw-spectator"
          @click="emit('withdrawSpectator')"
        />
      </div>
    </div>
  </SurfacePanel>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useNow } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import type { MatchVotes } from '@skol-arena/shared/types/index'
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import SectionHeader from '@/components/ui/SectionHeader.vue'
import SurfacePanel from '@/components/ui/SurfacePanel.vue'
import type { VotePlayer } from './vote-players'

const props = defineProps<{
  votes: MatchVotes & { mvp: NonNullable<MatchVotes['mvp']> }
  players: Map<string, VotePlayer>
  saving: boolean
}>()

const emit = defineEmits<{
  cast: [targetId: string]
  remove: []
  declareSpectator: []
  withdrawSpectator: []
}>()

const { t } = useI18n()
// Ticks every minute so the time left stays true on a page left open.
const now = useNow({ interval: 60_000 })

const mvp = computed(() => props.votes.mvp)

/** Time left to vote, rounded down; nothing once the vote is closed. */
const timeLeft = computed(() => {
  const closesAt = props.votes.closesAt
  if (!props.votes.isOpen || !closesAt) return null
  const minutes = Math.max(0, Math.floor((closesAt.getTime() - now.value) / 60_000))
  const [d, h, m] = [Math.floor(minutes / 1440), Math.floor((minutes % 1440) / 60), minutes % 60]
  let time = t('matchVotes.mvp.minutes', { m })
  if (d > 0) time = t('matchVotes.mvp.days', { d, h })
  else if (h > 0) time = t('matchVotes.mvp.hours', { h, m })
  return t('matchVotes.mvp.openFor', { time })
})
const mvpNames = computed(() =>
  mvp.value.mvpPlayerIds.map((id) => props.players.get(id)?.displayName ?? '?').join(', '),
)
const canVote = computed(() => props.votes.role === 'player' || props.votes.role === 'spectator')
const canDeclare = computed(
  () => props.votes.role === 'member' && props.votes.isOpen && mvp.value.spectatorsEnabled,
)
const blockedIds = computed(() => mvp.value.blockedTargetIds.filter((id) => mvp.value.myVote !== id))
const isBlocked = (id: string) => blockedIds.value.includes(id)
const blockedLabel = (id: string) =>
  t('matchVotes.mvp.alreadyVoted', { name: props.players.get(id)?.displayName ?? '?' })

function toggle(id: string) {
  if (mvp.value.myVote === id) emit('remove')
  else emit('cast', id)
}
</script>
