<template>
  <div class="rounded-2xl overflow-hidden bg-gray-800/40 border border-dashed border-white/10">
    <!-- Section header -->
    <div class="flex items-center gap-3 px-4 py-3">
      <div class="w-1 h-5 rounded-full shrink-0 bg-gray-500" />
      <i class="fa fa-hourglass-half text-sm w-4 text-center shrink-0 text-gray-400" />
      <span class="font-bold text-sm text-gray-300">{{
        t('rankedLeaderboard.placementSection')
      }}</span>
      <span class="text-xs text-gray-500 ml-auto shrink-0">{{
        t('rankedLeaderboard.placementUnranked')
      }}</span>
    </div>

    <!-- Player rows: progress only, no MMR and no rank — they are not ranked yet. -->
    <RouterLink
      v-for="(player, idx) in props.players"
      :key="player.player?.id ?? idx"
      :to="player.player ? playerLink(player.player.id, props.tournamentId) : '#'"
      class="flex items-center gap-3 px-4 py-2.5 border-t border-white/5 transition-colors"
      :class="
        player.player?.id === props.currentUserId
          ? 'bg-primary-900/30 hover:bg-primary-800/40'
          : 'hover:bg-white/5'
      "
    >
      <div class="w-5 text-center text-xs font-bold text-gray-600 shrink-0">
        <i class="fa fa-question" />
      </div>

      <PlayerAvatar
        :name="player.player?.displayName ?? '?'"
        :player-id="player.player?.id"
        shape="square"
        size="sm"
        class="shrink-0"
      />

      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5 min-w-0">
          <span class="font-semibold text-sm truncate">{{
            player.player?.displayName ?? t('rankedLeaderboard.unknownPlayer')
          }}</span>
          <span
            v-if="player.player?.id === props.currentUserId"
            class="text-[9px] font-bold text-primary-400 uppercase tracking-wide shrink-0"
            >{{ t('rankedLeaderboard.you') }}</span
          >
        </div>
        <div class="flex items-center justify-between gap-2">
          <span class="text-[10px] text-gray-400 tabular-nums">{{ progressLabel(player) }}</span>
          <RecentFormBadges
            v-if="player.recentResults?.length"
            :results="
              player.recentResults.map((r) =>
                r.outcome === 'win' ? 'V' : r.outcome === 'loss' ? 'D' : 'N',
              )
            "
          />
        </div>
        <div class="mt-1.5 h-1 rounded-full bg-gray-700/50 overflow-hidden">
          <div
            class="h-full rounded-full bg-gray-400"
            :style="{ width: `${placementProgress(player)}%` }"
          />
        </div>
      </div>
    </RouterLink>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { playerLink } from '@/utils/player-link'
import type { ClientPlayerMmr } from '@skol-arena/shared/types/index'
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import RecentFormBadges from '@/components/player/RecentFormBadges.vue'

const { t } = useI18n()

const props = defineProps<{
  players: ClientPlayerMmr[]
  /** Matches needed to be ranked — the denominator of the progress shown here. */
  placementMatches: number
  currentUserId?: string
  tournamentId?: string
}>()

function progressLabel(player: ClientPlayerMmr): string {
  return t('rankedLeaderboard.placementProgress', {
    played: player.matchesPlayed,
    total: props.placementMatches,
  })
}

function placementProgress(player: ClientPlayerMmr): number {
  if (props.placementMatches <= 0) return 100
  return Math.min(100, Math.round((player.matchesPlayed / props.placementMatches) * 100))
}
</script>
