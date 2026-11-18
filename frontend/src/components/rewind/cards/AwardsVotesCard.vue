<template>
  <RewindCardShell
    :eyebrow="t('rewind.awards.eyebrow')"
    eyebrow-class="bg-violet-500/20 text-violet-300"
    :title="t('rewind.awards.votes.title')"
    :subtitle="t('rewind.awards.votes.subtitle')"
  >
    <template v-if="votes">
      <AwardRow
        v-for="row in rows"
        :key="row.key"
        :label="t(`rewind.awards.votes.${row.key}`)"
        :player-name="row.award.player.displayName"
        :value="row.award.value"
        :suffix="row.suffix"
        :icon="AWARD_STYLE[row.key].icon"
        :accent="AWARD_STYLE[row.key].accent"
        :detail="t(`rewind.awards.votes.${row.key}Detail`, { count: row.award.detail ?? 0 })"
        :is-mine="won.has(row.key)"
      />
      <p v-if="podiumRest.length" class="text-center text-xs text-gray-400">
        {{ t('rewind.awards.votes.podium', { names: podiumRest.join(', ') }) }}
      </p>
      <p v-if="mineLine" class="rounded-2xl bg-white/5 px-4 py-3 text-center text-sm" data-testid="rewind-vote-mine">
        {{ mineLine }}
      </p>
      <p class="text-center text-xs text-gray-400" data-testid="rewind-vote-totals">
        {{ totalsLine }}
      </p>
    </template>
  </RewindCardShell>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  PlayerRewindPayload,
  RewindAward,
  RewindAwardKey,
  SeasonRewindPayload,
} from '@skol-arena/shared/types/index'
import RewindCardShell from '../RewindCardShell.vue'
import AwardRow from '../AwardRow.vue'
import { AWARD_STYLE } from '../award-display'

const props = withDefaults(
  defineProps<{
    season: SeasonRewindPayload
    awardsWon?: RewindAwardKey[]
    /** The viewer's own figures, 👎 included: this deck is theirs alone. */
    mine?: PlayerRewindPayload['votes'] | null
  }>(),
  { awardsWon: () => [], mine: null },
)

const { t } = useI18n()
const won = computed(() => new Set(props.awardsWon))
const votes = computed(() => props.season.votes ?? null)

type VoteAwardKey = Exclude<keyof NonNullable<SeasonRewindPayload['votes']>, 'totals' | 'fairPlayPodium'>
const ORDER: { key: VoteAwardKey; suffix?: string }[] = [
  { key: 'fairPlayPrize', suffix: ' %' },
  { key: 'teamCarrier' },
  { key: 'topSupporter' },
  { key: 'mostInvolved' },
  { key: 'kindest', suffix: ' %' },
  { key: 'strictestJudge', suffix: ' %' },
  { key: 'fairPlayWorst', suffix: ' %' },
]

const rows = computed(() =>
  ORDER.flatMap(({ key, suffix }) => {
    const award = votes.value?.[key] as RewindAward | null | undefined
    return award ? [{ key, suffix, award }] : []
  }),
)

const podiumRest = computed(() => (votes.value?.fairPlayPodium ?? []).slice(1).map((a) => a.player.displayName))

const mineLine = computed(() => {
  const m = props.mine
  if (!m) return null
  const parts: string[] = []
  if (m.fairPlayRate != null) {
    parts.push(t('rewind.awards.votes.mineRate', { rate: m.fairPlayRate, rank: m.fairPlayRank ?? '—' }))
  }
  if (m.mvpTitles > 0) parts.push(t('rewind.awards.votes.mineMvp', { count: m.mvpTitles }))
  if (m.down > 0) {
    const tags = m.tags.map((x) => t(`matchVotes.fairPlay.tags.${x.tag}`)).join(', ')
    parts.push(t('rewind.awards.votes.mineDown', { count: m.down }) + (tags ? ` (${tags})` : ''))
  }
  return parts.length ? `${t('rewind.awards.votes.you')} : ${parts.join(' · ')}` : null
})

const totalsLine = computed(() => {
  const totals = votes.value!.totals
  const parts = [t('rewind.awards.votes.totals', { count: totals.votes })]
  if (totals.positiveRate != null) parts.push(t('rewind.awards.votes.positive', { rate: totals.positiveRate }))
  if (totals.topTag) parts.push(t('rewind.awards.votes.topTag', { tag: t(`matchVotes.fairPlay.tags.${totals.topTag}`) }))
  return parts.join(' · ')
})
</script>
