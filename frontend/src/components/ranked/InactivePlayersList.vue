<template>
  <div
    class="rounded-2xl overflow-hidden bg-gray-800/40 border border-dashed border-white/10"
    data-testid="inactive-players"
  >
    <!-- Section header -->
    <div class="flex items-center gap-3 px-4 py-3">
      <div class="w-1 h-5 rounded-full shrink-0 bg-gray-600" />
      <i class="fa fa-user-slash text-sm w-4 text-center shrink-0 text-gray-500" />
      <span class="font-bold text-sm text-gray-300">{{
        t('rankedLeaderboard.inactiveSection')
      }}</span>
      <span class="text-xs text-gray-500 ml-auto shrink-0">{{
        t('rankedLeaderboard.inactiveUnranked')
      }}</span>
    </div>

    <!-- Player rows: the MMR they earned stays visible, but they hold no rank. -->
    <RouterLink
      v-for="(player, idx) in props.players"
      :key="player.player?.id ?? idx"
      :to="player.player ? playerLink(player.player.id, props.tournamentId) : '#'"
      class="flex items-center gap-3 px-4 py-2.5 border-t border-white/5 transition-colors opacity-60"
      :class="
        player.player?.id === props.currentUserId
          ? 'bg-primary-900/30 hover:bg-primary-800/40'
          : 'hover:bg-white/5'
      "
      data-testid="inactive-player-row"
    >
      <div class="w-5 text-center text-xs font-bold text-gray-600 shrink-0">—</div>

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
        <span class="text-[10px] text-gray-400 tabular-nums">{{ playedLabel(player) }}</span>
      </div>

      <div class="font-black text-sm tabular-nums shrink-0">{{ props.valueOf(player) }}</div>
    </RouterLink>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { playerLink } from '@/utils/player-link'
import type { ClientPlayerMmr } from '@skol-arena/shared/types/index'
import PlayerAvatar from '@/components/PlayerAvatar.vue'

const { t } = useI18n()

const props = defineProps<{
  players: ClientPlayerMmr[]
  /** The number the current view ranks on: current MMR or a season aggregate. */
  valueOf: (player: ClientPlayerMmr) => number
  currentUserId?: string
  tournamentId?: string
}>()

function playedLabel(player: ClientPlayerMmr): string {
  const number = player.matchesPlayed
  if (number === 1) return `${number} ${t('rankedLeaderboard.matchSingular')}`
  return `${number} ${t('rankedLeaderboard.matchPlural')}`
}
</script>
