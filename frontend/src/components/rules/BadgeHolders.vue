<template>
  <UModal v-if="holders.length" :title="t('badgeHolders.title', { badge: badgeLabel })">
    <button
      type="button"
      class="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-slate-200/60 dark:hover:bg-slate-700/60"
      :aria-label="t('badgeHolders.count', holders.length)"
    >
      <PlayerAvatarStack :players="holders" size="xs" />
      <span class="text-xs text-slate-500">{{ t('badgeHolders.count', holders.length) }}</span>
    </button>

    <template #body>
      <ul class="divide-y divide-gray-200 dark:divide-gray-800">
        <li v-for="holder in holders" :key="holder.id" class="flex items-center gap-3 py-2">
          <PlayerAvatar :name="holder.displayName" :color-key="holder.shortName" :player-id="holder.id" size="sm" />
          <RouterLink
            :to="playerLink(holder.id, tournamentId)"
            class="min-w-0 flex-1 truncate text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500"
            >{{ holder.displayName }}</RouterLink
          >
          <UBadge v-if="holder.earnedHere" color="primary" variant="subtle" size="sm">
            {{ t('badgeHolders.thisSeason') }}
          </UBadge>
          <span class="w-8 text-right text-sm font-semibold tabular-nums text-slate-500">
            {{ t('badgeHolders.times', { count: holder.count }) }}
          </span>
        </li>
      </ul>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import PlayerAvatarStack from '@/components/PlayerAvatarStack.vue'
import { playerLink } from '@/utils/player-link'
import type { BadgeHolder } from '@skol-arena/shared/types/index'

defineProps<{
  /** Already sorted by the server: this season's holders first, then by award count. */
  holders: BadgeHolder[]
  badgeLabel: string
  tournamentId: string
}>()

const { t } = useI18n()
</script>
