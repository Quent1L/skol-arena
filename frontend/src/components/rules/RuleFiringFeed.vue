<template>
  <UCard>
    <template #header>
      <h2 class="font-semibold text-highlighted">{{ t('rulesEngineOverview.feedTitle') }}</h2>
    </template>

    <div class="mb-4 grid grid-cols-1 gap-3 sm:flex sm:flex-wrap">
      <USelectMenu
        v-model="filters.type"
        :items="typeOptions"
        value-key="value"
        :search-input="false"
        clear
        :placeholder="t('rulesEngineList.filterType')"
        class="sm:w-44"
        @update:model-value="refresh"
      />
      <USelectMenu
        v-model="filters.ruleId"
        :items="ruleOptions"
        value-key="value"
        clear
        :placeholder="t('rulesEngineOverview.filterRule')"
        class="sm:w-64"
        @update:model-value="refresh"
      />
      <USelectMenu
        v-model="filters.result"
        :items="resultOptions"
        value-key="value"
        :search-input="false"
        clear
        :placeholder="t('rulesEngineStats.colResult')"
        class="sm:w-48"
        @update:model-value="refresh"
      />
      <USwitch
        v-if="filters.type !== 'message'"
        v-model="filters.includeHeld"
        :label="t('rulesEngineOverview.includeHeld')"
        class="sm:self-center"
        @update:model-value="refresh"
      />
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-fa7-solid:circle-xmark"
      :description="error"
      class="mb-4"
    />

    <ul v-if="feed.length" class="divide-y divide-default">
      <li v-for="item in feed" :key="item.id" class="flex gap-3 py-3">
        <UIcon
          :name="item.ruleType === 'badge' ? 'i-fa7-solid:medal' : 'i-fa7-solid:comment'"
          class="mt-0.5 size-4 shrink-0"
          :class="item.ruleType === 'badge' ? 'text-warning' : 'text-info'"
        />
        <div class="min-w-0 flex-1">
          <p class="text-sm">
            <RouterLink
              :to="playerLink(item.playerId)"
              class="font-medium text-highlighted hover:underline"
            >
              {{ item.playerName }}
            </RouterLink>
            <span class="text-muted"> · </span>
            <RouterLink :to="`/admin/rules-engine/${item.ruleId}/stats`" class="hover:underline">
              {{ item.ruleName }}
            </RouterLink>
          </p>
          <p v-if="item.message" class="truncate text-sm text-muted" :title="item.message">
            {{ item.message }}
          </p>
          <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            <UTooltip :text="item.createdAt.toLocaleString(locale)">
              <span>{{ relativeDate(item.createdAt) }}</span>
            </UTooltip>
            <!-- A badge has no message to read, so its fate is the award itself. -->
            <UBadge
              v-if="item.ruleType === 'badge'"
              :color="resultColor(item.result)"
              variant="subtle"
              size="sm"
              :label="t(`rulesEngineStats.result.${item.result}`)"
            />
            <UBadge
              v-else
              :color="fateColor(item)"
              variant="subtle"
              size="sm"
              :label="fateLabel(t, item)"
            />
            <RouterLink
              v-if="item.matchId"
              :to="`/matches/${item.matchId}`"
              class="hover:underline"
            >
              {{ t('rulesEngineStats.openMatch') }}
            </RouterLink>
          </div>
        </div>
      </li>
    </ul>
    <p v-else-if="!feedLoading" class="py-8 text-center text-muted">
      {{ t('rulesEngineOverview.feedEmpty') }}
    </p>

    <div v-if="feedCursor || (feedLoading && !feed.length)" class="mt-4 flex justify-center">
      <UButton
        :label="t('rulesEngineOverview.loadMore')"
        color="neutral"
        variant="outline"
        :loading="feedLoading"
        @click="loadMoreFeed(activeFilters())"
      />
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { formatDistanceToNow } from 'date-fns'
import { dateFnsLocaleFor } from '@/utils/DateFnsLocale'
import { playerLink } from '@/utils/player-link'
import { fateColor, fateLabel, resultColor } from '@/components/rules/firing-fate'
import { useRuleFiringOverview } from '@/composables/rules/rule-firing-overview.service'
import type { RuleFiringFeedFilters } from '@/composables/rules/rules.api'
import { RULE_FIRING_RESULTS } from '@skol-arena/shared'
import type { ClientRuleFiringStatsRow } from '@skol-arena/shared/types/index'

const props = defineProps<{
  /** Every rule, to offer as a filter. */
  rules: ClientRuleFiringStatsRow[]
}>()

const { t, locale } = useI18n()
const { feed, feedCursor, feedLoading, error, loadFeed, loadMoreFeed } = useRuleFiringOverview()

const filters = reactive<RuleFiringFeedFilters>({})

const typeOptions = [
  { label: t('rulesEngineList.typeMessage'), value: 'message' },
  { label: t('rulesEngineList.typeBadge'), value: 'badge' },
]
const resultOptions = RULE_FIRING_RESULTS.map((result) => ({
  label: t(`rulesEngineStats.result.${result}`),
  value: result,
}))
const ruleOptions = computed(() =>
  [...props.rules]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((rule) => ({ label: rule.name, value: rule.ruleId })),
)

/** A cleared select sets its key to undefined; copying drops the reactive proxy. */
function activeFilters(): RuleFiringFeedFilters {
  return {
    type: filters.type,
    ruleId: filters.ruleId,
    result: filters.result,
    // Already-held badges are hidden server-side unless asked for.
    includeHeld: filters.includeHeld || undefined,
  }
}

function relativeDate(date: Date) {
  return formatDistanceToNow(date, { addSuffix: true, locale: dateFnsLocaleFor(locale.value) })
}

function refresh() {
  return loadFeed(activeFilters())
}

defineExpose({ refresh })

onMounted(refresh)
</script>
