<template>
  <template v-if="stats">
    <div
      v-if="stats.fairPlayRanking.length || (showWeekly && stats.fairPlayOfTheWeek)"
      class="rounded-xl border border-gray-800 bg-gray-800 p-6"
      data-testid="fair-play-ranking"
    >
      <h2 class="mb-4 flex items-center gap-2 text-base font-semibold text-white">
        <i class="fa fa-handshake text-primary" />{{ t('voteStats.fairPlay.title') }}
        <InfoTooltip :text="t('voteStats.fairPlay.tooltip', { count: minVotes })" />
      </h2>
      <VoteOfTheWeek
        v-if="showWeekly && stats.fairPlayOfTheWeek"
        class="mb-4"
        kind="fairPlay"
        :players="stats.fairPlayOfTheWeek.players"
        :count="stats.fairPlayOfTheWeek.ups"
        :tournament-id="tournamentId"
      />
      <div v-if="stats.fairPlayRanking.length" :class="subheadingClass">
        {{ t('voteStats.rankingTitle') }}
      </div>
      <StatLeaderRow
        v-for="row in visibleRows(stats.fairPlayRanking, 'fairPlay')"
        :key="row.player.id"
        :players="[row.player]"
        :rank="row.rank"
        :value="percent(row.rate)"
        :sub-label="t('voteStats.fairPlay.votes', row.votes)"
        :bar-pct="barPct(weighted(row), weighted(stats.fairPlayRanking[0]))"
        bar-class="bg-primary"
        :tournament-id="tournamentId"
      />
      <button
        v-if="stats.fairPlayRanking.length > COLLAPSED_COUNT"
        type="button"
        class="mt-3 w-full py-2 text-sm font-medium text-gray-400 hover:text-white"
        :aria-expanded="expanded.fairPlay"
        data-test="toggle-fairPlay"
        @click="expanded.fairPlay = !expanded.fairPlay"
      >
        <i :class="expanded.fairPlay ? 'fa fa-chevron-up' : 'fa fa-chevron-down'" class="mr-2" />
        {{
          expanded.fairPlay
            ? t('common.showLess')
            : t('common.showMore', { count: stats.fairPlayRanking.length - COLLAPSED_COUNT })
        }}
      </button>
      <p class="mt-3 text-xs text-muted">
        {{
          t('voteStats.totals', {
            count: stats.totals.votes,
            rate: percent(stats.totals.positiveRate),
          })
        }}
      </p>
    </div>

    <div
      v-if="stats.mvpRanking.length || (showWeekly && stats.mvpOfTheWeek)"
      class="rounded-xl border border-gray-800 bg-gray-800 p-6"
      data-testid="mvp-ranking"
    >
      <h2 class="mb-4 text-base font-semibold text-white">
        <i class="fa fa-medal mr-2 text-amber-400" />{{ t('voteStats.mvp.title') }}
      </h2>
      <VoteOfTheWeek
        v-if="showWeekly && stats.mvpOfTheWeek"
        class="mb-4"
        kind="mvp"
        :players="stats.mvpOfTheWeek.players"
        :count="stats.mvpOfTheWeek.titles"
        :tournament-id="tournamentId"
      />
      <div v-if="stats.mvpRanking.length" :class="subheadingClass">
        {{ t('voteStats.rankingTitle') }}
      </div>
      <StatLeaderRow
        v-for="row in visibleRows(stats.mvpRanking, 'mvp')"
        :key="row.player.id"
        :players="[row.player]"
        :rank="row.rank"
        :value="t('voteStats.mvp.titles', { count: row.titles })"
        sub-label=""
        :bar-pct="barPct(row.titles, stats.mvpRanking[0].titles)"
        bar-class="bg-amber-400"
        :tournament-id="tournamentId"
      />
      <button
        v-if="stats.mvpRanking.length > COLLAPSED_COUNT"
        type="button"
        class="mt-3 w-full py-2 text-sm font-medium text-gray-400 hover:text-white"
        :aria-expanded="expanded.mvp"
        data-test="toggle-mvp"
        @click="expanded.mvp = !expanded.mvp"
      >
        <i :class="expanded.mvp ? 'fa fa-chevron-up' : 'fa fa-chevron-down'" class="mr-2" />
        {{
          expanded.mvp
            ? t('common.showLess')
            : t('common.showMore', { count: stats.mvpRanking.length - COLLAPSED_COUNT })
        }}
      </button>
    </div>
  </template>
</template>

<script setup lang="ts">
import { computed, provide, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TournamentVoteStats } from '@skol-arena/shared/types/index'
import StatLeaderRow from '@/components/stats/StatLeaderRow.vue'
import InfoTooltip from '@/components/InfoTooltip.vue'
import VoteOfTheWeek from './VoteOfTheWeek.vue'
import { STAT_ROWS_ARE_PLAYERS } from '@/utils/player-link'

/**
 * Fair-play / MVP rankings of the stats tab. Public figures are positive only; the
 * viewer's own figures live on their profile (MyVoteStatsCard). `hideWeekly` drops the
 * players of the week when the "This week" card already shows it.
 */
const props = defineProps<{
  stats: TournamentVoteStats | null
  hideWeekly?: boolean
  tournamentId?: string | null
  /** Votes a player needs before being ranked. */
  minVotes: number
}>()
const { t } = useI18n()

const showWeekly = computed(() => !props.hideWeekly)

/** The server ranks the top 10; the card opens on the top 5, like the other stat cards. */
const COLLAPSED_COUNT = 5
const expanded = reactive({ fairPlay: false, mvp: false })
function visibleRows<T>(rows: T[], kind: keyof typeof expanded): T[] {
  return expanded[kind] ? rows : rows.slice(0, COLLAPSED_COUNT)
}

const subheadingClass =
  'mb-2 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400'

// Votes always target players, even in a fixed-team tournament whose other boards rank teams.
provide(STAT_ROWS_ARE_PLAYERS, ref(true))

/** Bar width relative to the board leader, as on the other stat cards. */
const barPct = (value: number, leader: number) => (leader > 0 ? (value / leader) * 100 : 0)

/** The score the server ranks on (rate × √votes, `weightedScore`), so the bars follow the order. */
const weighted = (row: { rate: number | null; votes: number }) =>
  (row.rate ?? 0) * Math.sqrt(row.votes)

const percent = (rate: number | null) => (rate == null ? '—' : `${Math.round(rate * 100)} %`)
</script>
