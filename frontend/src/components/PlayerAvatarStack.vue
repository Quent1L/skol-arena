<template>
  <div class="flex items-center" :class="tileCount > 1 ? '-space-x-2' : ''">
    <PlayerAvatar
      v-for="(player, idx) in visiblePlayers"
      :key="player.id"
      :name="player.displayName"
      :color-key="player.shortName"
      :player-id="player.id"
      :size="size"
      :style="{ zIndex: 30 - idx * 10 }"
    />

    <!-- Past `max`, a roster of ten avatars is a smear: keep the head of the list and
         count the rest. The hidden names stay reachable on hover. -->
    <div
      v-if="hiddenCount > 0"
      class="flex shrink-0 items-center justify-center rounded-md border border-surface-900 bg-surface-700 font-bold tabular-nums text-white/80 ring-1 ring-surface-700/20"
      :class="avatarSizeClass(size)"
      :style="{ zIndex: 30 - visiblePlayers.length * 10 }"
      :title="hiddenNames"
    >
      +{{ hiddenCount }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import { avatarSizeClass, type AvatarSize } from '@/components/avatar-size'

const props = withDefaults(
  defineProps<{
    players: { id: string; displayName: string; shortName: string }[]
    size?: AvatarSize
    /** How many faces to show before collapsing the rest into a "+N" chip. */
    max?: number
  }>(),
  { max: 3 },
)

const visiblePlayers = computed(() =>
  props.players.length > props.max ? props.players.slice(0, props.max) : props.players,
)

const hiddenCount = computed(() => props.players.length - visiblePlayers.value.length)

const hiddenNames = computed(() =>
  props.players
    .slice(visiblePlayers.value.length)
    .map((p) => p.displayName)
    .join(', '),
)

const tileCount = computed(() => visiblePlayers.value.length + (hiddenCount.value > 0 ? 1 : 0))
</script>
