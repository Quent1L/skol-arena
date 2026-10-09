<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-baseline justify-between text-xs">
      <span v-if="!hideTitle" class="font-semibold text-slate-600 dark:text-slate-300">{{
        t('matchBalance.title')
      }}</span>
      <span class="text-muted" :class="{ 'ms-auto': !hideTitle }">{{
        t(`matchBalance.verdict.${verdict}`)
      }}</span>
    </div>

    <div
      class="flex h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
      role="img"
      :aria-label="t(ariaLabelKey, { teamA: percents.a, teamB: percents.b })"
    >
      <div
        class="h-full bg-sky-500 transition-[width] duration-300 ease-out"
        :style="{ width: `${percents.a}%` }"
      />
      <div
        class="h-full bg-amber-500 transition-[width] duration-300 ease-out"
        :style="{ width: `${percents.b}%` }"
      />
    </div>

    <div class="flex items-center justify-between text-xs">
      <span class="flex items-center gap-1.5">
        <span class="inline-block h-2 w-2 rounded-full bg-sky-500" />
        <span class="font-semibold tabular-nums">{{ percents.a }}%</span>
        <span class="text-muted">{{ t('matchBalance.avgMmr', { mmr: balance.avgA }) }}</span>
      </span>
      <span class="flex items-center gap-1.5">
        <span class="text-muted">{{ t('matchBalance.avgMmr', { mmr: balance.avgB }) }}</span>
        <span class="font-semibold tabular-nums">{{ percents.b }}%</span>
        <span class="inline-block h-2 w-2 rounded-full bg-amber-500" />
      </span>
    </div>

    <p v-if="allowDraw" class="text-xs">
      <i class="fa fa-circle-info mr-1" />{{ t('matchBalance.drawHint') }}
    </p>

    <p v-if="balance.hasProvisional" class="text-xs">
      <i class="fa fa-circle-info mr-1" />{{ t('matchBalance.provisional') }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { getBalanceVerdict, toPercents } from '@/composables/match/match-balance'
import type { MatchBalance } from '@/composables/match/match-balance'

interface Props {
  balance: MatchBalance
  /**
   * Whether the season allows draws. Elo has no draw term: the number the bar
   * shows is an expected score, in which a draw is worth half a point to each
   * side. That equals a win probability only when a draw is impossible, so the
   * wording changes rather than the figure.
   */
  allowDraw?: boolean
  /** Drop the heading where the surrounding panel already names the bar. */
  hideTitle?: boolean
}

const props = defineProps<Props>()
const { t } = useI18n()

const percents = computed(() => toPercents(props.balance))
const verdict = computed(() => getBalanceVerdict(props.balance))
const ariaLabelKey = computed(() =>
  props.allowDraw ? 'matchBalance.ariaLabelWithDraw' : 'matchBalance.ariaLabel',
)
</script>
