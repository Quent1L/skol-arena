<template>
  <RouterLink
    :to="{ path: `/players/${playerId}`, query, hash: `#${CAREER_ANCHOR}` }"
    class="w-full flex items-center gap-2 rounded-xl p-3 bg-gray-800 hover:bg-gray-700 transition-colors text-sm font-bold text-gray-300"
    data-test="career-link"
  >
    <i class="fa fa-clock-rotate-left text-gray-400" />
    <span>{{
      t(own ? 'playerRankedCareer.viewHistoryOwn' : 'playerRankedCareer.viewHistory')
    }}</span>
    <i class="fa fa-chevron-right text-xs text-gray-500 ml-auto" />
  </RouterLink>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { CAREER_ANCHOR } from '@/composables/ranked/career'

/**
 * Way out of a competition's profile tab and into the player's own stats page,
 * landing on the ranked career card. The history spans every discipline, so it
 * belongs to the player rather than to the season being looked at — a link keeps
 * it one click away without pushing the season's own figures down the page.
 */
const props = defineProps<{
  playerId: string
  disciplineId?: string | null
  /** The signed-in player looking at their own record, which the label says. */
  own?: boolean
}>()

const { t } = useI18n()

// Same query keys the compare page already uses, so the stats page opens on the
// ranked runs of this discipline rather than on the player's whole record.
const query = computed<Record<string, string>>(() => ({
  mode: 'ranked',
  ...(props.disciplineId ? { disciplineId: props.disciplineId } : {}),
}))
</script>
