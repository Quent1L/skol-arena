<template>
  <div v-if="grouped.length > 0" class="rounded-2xl p-4">
    <div class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">{{ t('playerBadges.title') }}</div>
    <div class="grid grid-cols-3 sm:grid-cols-4 gap-3">
      <UPopover v-for="group in grouped" :key="group.ruleId">
        <button
          type="button"
          class="relative flex flex-col items-center text-center p-3 rounded-xl bg-slate-100 dark:bg-slate-800 gap-2 cursor-pointer transition-all hover:scale-[1.03] hover:shadow-md"
        >
          <span
            v-if="group.awards.length > 1"
            class="absolute top-1.5 right-1.5 min-w-5 px-1.5 py-0.5 rounded-full bg-purple-600 text-white text-[10px] font-bold leading-none flex items-center justify-center"
          >
            ×{{ group.awards.length }}
          </span>
          <i :class="group.icon || 'fa fa-medal'" class="text-3xl text-purple-600" />
          <div class="font-semibold text-sm leading-tight">{{ group.label }}</div>
        </button>

        <template #content>
          <div class="flex flex-col gap-2 max-w-60 p-3">
            <div class="flex items-center gap-2">
              <i :class="group.icon || 'fa fa-medal'" class="text-xl text-purple-600" />
              <div class="font-semibold text-sm">{{ group.label }}</div>
              <span v-if="group.awards.length > 1" class="text-xs font-bold text-purple-600 dark:text-purple-400">
                ×{{ group.awards.length }}
              </span>
            </div>
            <div class="text-xs text-slate-500">{{ group.description }}</div>
            <div class="flex flex-col gap-1 text-xs text-purple-500 dark:text-purple-400 font-medium">
              <div v-for="award in group.awards" :key="award.id" class="flex items-center gap-1">
                <i class="fa fa-calendar" />
                <span>{{ award.seasonName ?? t('playerBadges.unknownSeason') }}</span>
                <span class="text-slate-500">— {{ formatDate(award.awardedAt) }}</span>
              </div>
            </div>
          </div>
        </template>
      </UPopover>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { rulesApi } from '@/composables/rules/rules.api'
import { onWsEvent } from '@/composables/notification/notification.socket'
import type { ClientPlayerBadge } from '@skol-arena/shared/types/index'

/** One badge and every time it was won — a seasonal badge yields several awards. */
interface BadgeGroup {
  ruleId: string
  icon: string
  label: string
  description: string
  awards: ClientPlayerBadge[]
}

const props = defineProps<{ playerId: string }>()

const { t } = useI18n()

const badges = ref<ClientPlayerBadge[]>([])

/**
 * The API returns one entry per award. A badge the player won in three seasons must
 * still read as one badge, so group by rule and let the count carry the repetition.
 */
const grouped = computed<BadgeGroup[]>(() => {
  const groups = new Map<string, BadgeGroup>()
  for (const badge of badges.value) {
    const group = groups.get(badge.ruleId)
    if (group) group.awards.push(badge)
    else
      groups.set(badge.ruleId, {
        ruleId: badge.ruleId,
        icon: badge.icon,
        label: badge.label,
        description: badge.description,
        awards: [badge],
      })
  }
  for (const group of groups.values()) {
    group.awards.sort((a, b) => new Date(b.awardedAt).getTime() - new Date(a.awardedAt).getTime())
  }
  return [...groups.values()].sort(
    (a, b) => new Date(b.awards[0].awardedAt).getTime() - new Date(a.awards[0].awardedAt).getTime(),
  )
})

async function load(id: string) {
  if (!id) return
  try {
    badges.value = await rulesApi.getPlayerBadges(id)
  } catch {
    badges.value = []
  }
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString('fr-FR')
}

watch(() => props.playerId, load, { immediate: true })

const reload = () => load(props.playerId)
const offAwarded = onWsEvent('badge_awarded', reload)
const offRevoked = onWsEvent('badge_revoked', reload)
onUnmounted(() => {
  offAwarded()
  offRevoked()
})
</script>
