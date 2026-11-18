<template>
  <SurfacePanel data-testid="fair-play-section">
    <template #header>
      <div class="flex items-center justify-between gap-3">
        <SectionHeader icon="fa fa-handshake" :title="t('matchVotes.fairPlay.title')" />
        <span class="shrink-0 text-xs text-muted">
          {{ votes.isOpen ? t('matchVotes.editableUntil', { date: closesAtLabel }) : t('matchVotes.closed') }}
        </span>
      </div>
    </template>

    <p v-if="!votes.isOpen && fairPlay.myVotes.length === 0" class="text-sm text-muted">
      {{ t('matchVotes.closed') }}
    </p>
    <div v-else class="space-y-3">
      <UButton
        v-if="votes.isOpen && fairPlay.opponentIds.length >= 2"
        :label="t('matchVotes.fairPlay.wholeTeam')"
        icon="i-fa7-solid:thumbs-up"
        variant="soft"
        size="sm"
        :disabled="saving"
        data-testid="fair-play-team-up"
        @click="emit('teamUp')"
      />
      <div v-for="id in fairPlay.opponentIds" :key="id" class="space-y-2" :data-testid="`fair-play-row-${id}`">
        <div class="flex items-center gap-3">
          <PlayerAvatar :name="players.get(id)?.displayName ?? '?'" :player-id="id" size="sm" />
          <span class="min-w-0 flex-1 truncate text-sm font-semibold text-white/90">
            {{ players.get(id)?.displayName }}
          </span>
          <UButton
            icon="i-fa7-solid:thumbs-up"
            :color="valueOf(id) === 'up' ? 'primary' : 'neutral'"
            :variant="valueOf(id) === 'up' ? 'solid' : 'outline'"
            :aria-label="t('matchVotes.fairPlay.up')"
            :aria-pressed="valueOf(id) === 'up'"
            :disabled="!votes.isOpen || saving"
            data-testid="fair-play-up"
            @click="toggle(id, 'up')"
          />
          <UButton
            icon="i-fa7-solid:thumbs-down"
            :color="valueOf(id) === 'down' ? 'warning' : 'neutral'"
            :variant="valueOf(id) === 'down' ? 'solid' : 'outline'"
            :aria-label="t('matchVotes.fairPlay.down')"
            :aria-pressed="valueOf(id) === 'down'"
            :disabled="!votes.isOpen || saving"
            data-testid="fair-play-down"
            @click="toggle(id, 'down')"
          />
        </div>
        <div v-if="valueOf(id) === 'down'" class="flex flex-wrap gap-1.5 pl-10">
          <UButton
            v-for="tag in FAIR_PLAY_TAGS"
            :key="tag"
            :label="t(`matchVotes.fairPlay.tags.${tag}`)"
            size="xs"
            :color="tagsOf(id).includes(tag) ? 'warning' : 'neutral'"
            :variant="tagsOf(id).includes(tag) ? 'soft' : 'outline'"
            :disabled="!votes.isOpen || saving"
            :data-testid="`fair-play-tag-${tag}`"
            @click="toggleTag(id, tag)"
          />
        </div>
      </div>
    </div>
  </SurfacePanel>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  FAIR_PLAY_TAGS,
  type FairPlayTag,
  type FairPlayVoteValue,
  type MatchVotes,
} from '@skol-arena/shared/types/index'
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import SectionHeader from '@/components/ui/SectionHeader.vue'
import SurfacePanel from '@/components/ui/SurfacePanel.vue'
import type { VotePlayer } from './vote-players'

const props = defineProps<{
  votes: MatchVotes & { fairPlay: NonNullable<MatchVotes['fairPlay']> }
  players: Map<string, VotePlayer>
  saving: boolean
}>()

const emit = defineEmits<{
  cast: [targetId: string, value: FairPlayVoteValue, tags: FairPlayTag[]]
  remove: [targetId: string]
  teamUp: []
}>()

const { t, locale } = useI18n()

const fairPlay = computed(() => props.votes.fairPlay)
const closesAtLabel = computed(() =>
  props.votes.closesAt?.toLocaleString(locale.value, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }),
)

const voteOf = (id: string) => fairPlay.value.myVotes.find((v) => v.targetId === id)
const valueOf = (id: string) => voteOf(id)?.value ?? null
const tagsOf = (id: string) => voteOf(id)?.tags ?? []

/** Tap selects, tapping the selected value again withdraws the vote. */
function toggle(id: string, value: FairPlayVoteValue) {
  if (valueOf(id) === value) emit('remove', id)
  else emit('cast', id, value, [])
}

function toggleTag(id: string, tag: FairPlayTag) {
  const tags = tagsOf(id)
  emit('cast', id, 'down', tags.includes(tag) ? tags.filter((x) => x !== tag) : [...tags, tag])
}
</script>
