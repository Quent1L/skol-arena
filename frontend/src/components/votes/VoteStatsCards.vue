<template>
  <template v-if="stats">
    <!-- Mine: visible to the player alone -->
    <div v-if="mine && hasMine" class="lg:col-span-2 rounded-xl border border-gray-800 bg-gray-800 p-6" data-testid="my-vote-stats">
      <h2 class="mb-4 text-base font-semibold text-white">
        <i class="fa fa-user-shield mr-2 text-primary" />{{ t('voteStats.mine.title') }}
      </h2>
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div v-for="kpi in myKpis" :key="kpi.label">
          <div class="text-xl font-bold text-white tabular-nums">{{ kpi.value }}</div>
          <div class="text-xs text-muted">{{ kpi.label }}</div>
        </div>
      </div>
      <p v-if="mine.fairPlay.down > 0" class="mt-4 text-sm text-muted">
        {{ t('voteStats.mine.downs', { count: mine.fairPlay.down }) }}
        <span v-if="mine.fairPlay.tags.length">· {{ tagLine }}</span>
      </p>
    </div>

    <div v-if="stats.fairPlayRanking.length || stats.fairPlayOfTheWeek" class="rounded-xl border border-gray-800 bg-gray-800 p-6" data-testid="fair-play-ranking">
      <h2 class="mb-4 text-base font-semibold text-white">
        <i class="fa fa-handshake mr-2 text-primary" />{{ t('voteStats.fairPlay.title') }}
      </h2>
      <p v-if="stats.fairPlayOfTheWeek" class="mb-3 text-sm text-white/90">
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
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MyVoteStats, TournamentVoteStats } from '@skol-arena/shared/types/index'
import { votesApi } from '@/composables/votes/votes.api'
import PlayerAvatar from '@/components/PlayerAvatar.vue'

/** Fair-play / MVP cards of the stats tab. Public figures are positive only. */
const props = defineProps<{ tournamentId: string }>()
const { t } = useI18n()

const stats = ref<TournamentVoteStats | null>(null)
const mine = ref<MyVoteStats | null>(null)

watch(
  () => props.tournamentId,
  async (id) => {
    try {
      ;[stats.value, mine.value] = await Promise.all([votesApi.publicStats(id), votesApi.myStats(id)])
    } catch {
      // Optional cards: they drop out rather than take the tab down.
      stats.value = null
    }
  },
  { immediate: true },
)

const percent = (rate: number | null) => (rate == null ? '—' : `${Math.round(rate * 100)} %`)

const hasMine = computed(() => {
  const m = mine.value
  return !!m && m.fairPlay.up + m.fairPlay.down + m.cast.count + m.mvp.titles + m.spectated > 0
})

const myKpis = computed(() => {
  const m = mine.value!
  return [
    {
      label: t('voteStats.mine.fairPlayRate'),
      value: m.fairPlay.rate == null ? '—' : `${percent(m.fairPlay.rate)}${m.fairPlay.rank ? ` (#${m.fairPlay.rank})` : ''}`,
    },
    { label: t('voteStats.mine.votesCast'), value: `${m.cast.count} · ${percent(m.cast.upRate)} 👍` },
    { label: t('voteStats.mine.mvpTitles'), value: `${m.mvp.titles} / ${m.mvp.teamMatches}` },
    { label: t('voteStats.mine.spectated'), value: m.spectated },
  ]
})

const tagLine = computed(() =>
  mine.value!.fairPlay.tags.map((x) => `${t(`matchVotes.fairPlay.tags.${x.tag}`)} ×${x.count}`).join(', '),
)
</script>
