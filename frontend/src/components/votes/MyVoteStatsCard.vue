<template>
  <!-- Visible to the player alone -->
  <div v-if="mine && hasMine" class="rounded-xl border border-gray-800 bg-gray-800 p-4 sm:p-6" data-testid="my-vote-stats">
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
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MyVoteStats } from '@skol-arena/shared/types/index'
import { votesApi } from '@/composables/votes/votes.api'

/** The viewer's own fair-play / MVP figures in a tournament, shown on their profile. */
const props = defineProps<{ tournamentId: string }>()
const { t } = useI18n()

const mine = ref<MyVoteStats | null>(null)

watch(
  () => props.tournamentId,
  async (id) => {
    try {
      mine.value = await votesApi.myStats(id)
    } catch {
      // Optional card: it drops out rather than take the profile down.
      mine.value = null
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
