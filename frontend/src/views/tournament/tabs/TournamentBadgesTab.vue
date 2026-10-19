<template>
  <div class="space-y-4 sm:space-y-6">
    <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-800 p-4 sm:p-6">
      <div class="flex items-center gap-2 mb-6">
        <div class="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
          <i class="fa fa-medal text-purple-600 dark:text-purple-400 text-sm sm:text-base" />
        </div>
        <div>
          <div class="font-semibold text-gray-900 dark:text-white text-sm sm:text-base">{{ t('tournamentBadgesTab.title') }}</div>
          <div class="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            <template v-if="appUser">{{ t('tournamentBadgesTab.earnedCount', { earned: earnedCount, total: availableBadges.length }) }}</template>
            <template v-else>{{ t('tournamentBadgesTab.availableCount', { count: availableBadges.length }) }}</template>
          </div>
        </div>
      </div>

      <div v-if="loading" class="flex justify-center py-8">
        <UIcon name="i-lucide-loader-circle" class="size-10 animate-spin text-muted" />
      </div>

      <div v-else-if="availableBadges.length === 0" class="text-center py-8 text-gray-500 dark:text-gray-400">
        <i class="fa fa-medal text-4xl mb-3 block opacity-30" />
        <p>{{ t('tournamentBadgesTab.emptyState') }}</p>
      </div>

      <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        <div
          v-for="badge in availableBadges"
          :key="badge.ruleId"
          class="flex flex-col items-center text-center p-4 rounded-xl gap-2 transition-all hover:scale-[1.03] hover:shadow-md cursor-default"
          :class="isEarned(badge.ruleId)
            ? 'bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 hover:border-purple-400 dark:hover:border-purple-500'
            : 'bg-slate-100 dark:bg-slate-800 opacity-50 hover:opacity-80'"
        >
          <i
            :class="[badge.icon || 'fa fa-medal', isEarned(badge.ruleId) ? 'text-purple-600' : 'text-gray-400 dark:text-gray-500']"
            class="text-3xl"
          />
          <div class="font-semibold text-sm leading-tight">{{ badge.label }}</div>
          <div class="text-xs text-slate-500 line-clamp-2">{{ badge.description }}</div>
          <span
            v-if="badge.recurrence === 'once'"
            class="text-[10px] uppercase tracking-wide font-bold text-amber-600 dark:text-amber-400"
          >
            {{ t('tournamentBadgesTab.lifetimeBadge') }}
          </span>
          <div v-if="isEarned(badge.ruleId)" class="text-xs text-purple-600 dark:text-purple-400 font-medium">
            <i class="fa fa-check mr-1" />{{ formatDate(getEarnedDate(badge.ruleId)) }}
          </div>
          <div v-else-if="previousSeasons(badge.ruleId).length" class="text-xs text-slate-500">
            <i class="fa fa-clock-rotate-left mr-1" />{{
              t('tournamentBadgesTab.alreadyEarnedIn', { seasons: previousSeasons(badge.ruleId).join(', ') })
            }}
          </div>
          <BadgeHolders
            :holders="badge.holders ?? []"
            :badge-label="badge.label"
            :tournament-id="tournamentId"
            class="mt-auto"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { rulesApi } from '@/composables/rules/rules.api'
import { useAuth } from '@/composables/useAuth'
import { onWsEvent } from '@/composables/notification/notification.socket'
import BadgeHolders from '@/components/rules/BadgeHolders.vue'
import type { AvailableBadge, ClientPlayerBadge } from '@skol-arena/shared/types/index'

const route = useRoute()
const { appUser } = useAuth()
const { t } = useI18n()

const availableBadges = ref<AvailableBadge[]>([])
const playerBadges = ref<ClientPlayerBadge[]>([])
const loading = ref(true)

const tournamentId = computed(() => route.params.id as string)

/**
 * This tab is a checklist for the season being viewed, so "earned" means earned HERE.
 * A seasonal badge won last season leaves this one to win again, and saying otherwise
 * would hide the thing the player still has to do.
 */
const earnedHere = computed(
  () => new Map(playerBadges.value.filter((b) => b.seasonId === tournamentId.value).map((b) => [b.ruleId, b])),
)

/** Seasons other than this one where the badge was already won, most recent first. */
const earnedElsewhere = computed(() => {
  const byRule = new Map<string, string[]>()
  for (const badge of playerBadges.value) {
    if (badge.seasonId === tournamentId.value) continue
    const name = badge.seasonName ?? t('tournamentBadgesTab.unknownSeason')
    const seasons = byRule.get(badge.ruleId)
    if (seasons) seasons.push(name)
    else byRule.set(badge.ruleId, [name])
  }
  return byRule
})

const earnedCount = computed(() => availableBadges.value.filter((b) => earnedHere.value.has(b.ruleId)).length)

function isEarned(ruleId: string): boolean {
  return earnedHere.value.has(ruleId)
}

function getEarnedDate(ruleId: string): Date | undefined {
  return earnedHere.value.get(ruleId)?.awardedAt
}

function previousSeasons(ruleId: string): string[] {
  return earnedElsewhere.value.get(ruleId) ?? []
}

function formatDate(date: Date | undefined): string {
  if (!date) return ''
  return new Date(date).toLocaleDateString('fr-FR')
}

/**
 * `silent` keeps the grid on screen: a live badge event refreshes it in place instead
 * of swapping in the spinner, which would also close an open holders list.
 */
async function load({ silent = false } = {}) {
  if (!silent) loading.value = true
  try {
    const [badges, earned] = await Promise.all([
      rulesApi.getAvailableBadges(tournamentId.value, { withHolders: true }),
      appUser.value ? rulesApi.getPlayerBadges(appUser.value.id) : Promise.resolve([]),
    ])
    availableBadges.value = badges
    playerBadges.value = earned
  } finally {
    loading.value = false
  }
}

watch(() => route.params.id, () => load(), { immediate: true })

const reloadSilently = () => load({ silent: true })
const offAwarded = onWsEvent('badge_awarded', reloadSilently)
const offRevoked = onWsEvent('badge_revoked', reloadSilently)
onUnmounted(() => {
  offAwarded()
  offRevoked()
})
</script>
