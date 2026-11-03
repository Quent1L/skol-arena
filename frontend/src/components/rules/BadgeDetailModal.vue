<template>
  <UModal :title="badge.label">
    <slot />

    <template #body>
      <div class="flex items-start gap-3">
        <i :class="badge.icon || 'fa fa-medal'" class="text-2xl text-purple-600 shrink-0 mt-0.5" />
        <p class="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line">{{ badge.description }}</p>
      </div>

      <div class="mt-5 text-xs font-bold text-gray-400 uppercase tracking-wide">
        {{ t('badgeDetail.holders', holders.length) }}
      </div>
      <p v-if="!holders.length" class="mt-2 text-sm text-slate-500">{{ t('badgeDetail.noHolder') }}</p>
      <ul v-else class="mt-1 divide-y divide-gray-200 dark:divide-gray-800">
        <li v-for="holder in holders" :key="holder.id" class="flex items-center gap-3 py-2">
          <PlayerAvatar :name="holder.displayName" :color-key="holder.shortName" :player-id="holder.id" size="sm" />
          <RouterLink
            :to="playerLink(holder.id, tournamentId)"
            class="min-w-0 flex-1 truncate text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500"
            >{{ holder.displayName }}</RouterLink
          >
          <UBadge v-if="holder.earnedHere" color="primary" variant="subtle" size="sm">
            {{ t('badgeDetail.thisSeason') }}
          </UBadge>
          <span class="w-8 text-right text-sm font-semibold tabular-nums text-slate-500">
            {{ t('badgeDetail.times', { count: holder.count }) }}
          </span>
        </li>
      </ul>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import { playerLink } from '@/utils/player-link'
import type { AvailableBadge } from '@skol-arena/shared/types/index'

/**
 * The badge's full card: the tile only has room for a name, so the description and
 * the holders live here. The default slot is the trigger — the tile itself.
 */
const props = defineProps<{
  badge: AvailableBadge
  tournamentId: string
}>()

const { t } = useI18n()

/** Already sorted by the server: this season's holders first, then by award count. */
const holders = computed(() => props.badge.holders ?? [])
</script>
