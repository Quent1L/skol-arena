<template>
  <template v-if="stats">
    <div v-if="stats.fairPlayRanking.length || showWeekly" class="rounded-xl border border-gray-800 bg-gray-800 p-6" data-testid="fair-play-ranking">
      <h2 class="mb-4 text-base font-semibold text-white">
        <i class="fa fa-handshake mr-2 text-primary" />{{ t('voteStats.fairPlay.title') }}
      </h2>
      <p v-if="showWeekly && stats.fairPlayOfTheWeek" class="mb-3 text-sm text-white/90">
        🏅 {{ t('voteStats.fairPlay.ofTheWeek', { name: stats.fairPlayOfTheWeek.player.displayName, count: stats.fairPlayOfTheWeek.ups }) }}
      </p>
      <ol class="space-y-2">
        <li v-for="row in stats.fairPlayRanking" :key="row.player.id" class="flex items-center gap-3 text-sm">
          <span class="w-5 text-right text-muted tabular-nums">{{ row.rank }}</span>
          <PlayerAvatar :name="row.player.displayName" :player-id="row.player.id" size="xs" />
          <span class="min-w-0 flex-1 truncate text-white/90">{{ row.player.displayName }}</span>
          <span class="font-semibold tabular-nums text-white">{{ percent(row.rate) }}</span>
        </li>
      </ol>
      <p class="mt-3 text-xs text-muted">
        {{ t('voteStats.totals', { count: stats.totals.votes, rate: percent(stats.totals.positiveRate) }) }}
      </p>
    </div>

    <div v-if="stats.mvpRanking.length" class="rounded-xl border border-gray-800 bg-gray-800 p-6" data-testid="mvp-ranking">
      <h2 class="mb-4 text-base font-semibold text-white">
        <i class="fa fa-medal mr-2 text-amber-400" />{{ t('voteStats.mvp.title') }}
      </h2>
      <ol class="space-y-2">
        <li v-for="row in stats.mvpRanking" :key="row.player.id" class="flex items-center gap-3 text-sm">
          <span class="w-5 text-right text-muted tabular-nums">{{ row.rank }}</span>
          <PlayerAvatar :name="row.player.displayName" :player-id="row.player.id" size="xs" />
          <span class="min-w-0 flex-1 truncate text-white/90">{{ row.player.displayName }}</span>
          <span class="font-semibold tabular-nums text-white">{{ t('voteStats.mvp.titles', { count: row.titles }) }}</span>
        </li>
      </ol>
    </div>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TournamentVoteStats } from '@skol-arena/shared/types/index'
import PlayerAvatar from '@/components/PlayerAvatar.vue'

/**
 * Fair-play / MVP rankings of the stats tab. Public figures are positive only; the
 * viewer's own figures live on their profile (MyVoteStatsCard). `hideWeekly` drops the
 * fair-play of the week when the "This week" card already shows it.
 */
const props = defineProps<{ stats: TournamentVoteStats | null; hideWeekly?: boolean }>()
const { t } = useI18n()

const showWeekly = computed(() => !props.hideWeekly && !!props.stats?.fairPlayOfTheWeek)

const percent = (rate: number | null) => (rate == null ? '—' : `${Math.round(rate * 100)} %`)
</script>
