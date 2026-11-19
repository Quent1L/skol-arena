<template>
  <div :data-testid="`weekly-${kind}`">
    <div
      class="flex items-center gap-1 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2"
    >
      <i :class="kind === 'mvp' ? 'fa fa-medal text-amber-400' : 'fa fa-handshake text-primary'" />
      {{ t(kind === 'mvp' ? 'voteStats.mvp.weekTitle' : 'voteStats.fairPlay.weekTitle') }}
    </div>
    <div class="flex justify-between items-center gap-2 py-1.5">
      <RouterLink
        :to="playerLink(player.id, tournamentId)"
        class="flex items-center gap-2 min-w-0 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500"
      >
        <PlayerAvatar
          :name="player.displayName"
          :color-key="player.shortName"
          :player-id="player.id"
          size="xs"
          shape="square"
          class="shrink-0"
        />
        <span class="truncate">{{ player.displayName }}</span>
      </RouterLink>
      <span
        class="flex items-center gap-1 text-sm font-black tabular-nums shrink-0 text-gray-900 dark:text-white"
      >
        <template v-if="kind === 'mvp'">{{ t('voteStats.mvp.titles', { count }) }}</template>
        <template v-else>
          {{ count }}
          <UIcon name="i-fa7-solid:thumbs-up" class="size-3.5 text-primary" />
        </template>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { VoteStatPlayer } from '@skol-arena/shared/types/index'
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import { playerLink } from '@/utils/player-link'

/**
 * The player of the last 7 days, as a row of the stats cards: most 👍 for fair-play,
 * most titles for MVP.
 */
defineProps<{
  kind: 'fairPlay' | 'mvp'
  player: VoteStatPlayer
  count: number
  tournamentId?: string | null
}>()
const { t } = useI18n()
</script>
