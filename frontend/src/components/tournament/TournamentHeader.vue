<template>
  <div class="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4">
    <div class="flex-1">
      <div class="flex justify-between items-center mb-2">
        <div class="flex items-center gap-3">
          <UBadge :label="statusLabels[status]" :color="statusColors[status]" variant="solid" />
          <UBadge :label="modeLabels[mode]" color="info" variant="solid" />
        </div>

        <div class="flex items-center gap-3">
          <UButton
            v-if="isAuthenticated && !isParticipant && canJoin"
            :label="t('tournamentHeader.participate')"
            icon="i-fa7-solid:user-plus"
            color="success"
            :loading="joining"
            @click="$emit('join')"
          />

          <div
            v-if="isAuthenticated && isParticipant && !canLeave"
            class="flex items-center gap-2 text-green-600"
          >
            <i class="fa fa-check-circle"></i>
            <span class="font-medium">{{ t('tournamentHeader.alreadyRegistered') }}</span>
          </div>

          <UButton
            v-if="canCreateMatch"
            :label="t('tournamentHeader.createMatch')"
            icon="i-fa7-solid:plus"
            color="info"
            class="hidden md:flex"
            @click="emit('create-match')"
          />
          <OverflowMenuButton :items="items" />
        </div>
      </div>

      <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">
        {{ name }}
      </h1>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TournamentStatus, TournamentMode } from '@skol-arena/shared'
import type { OverflowMenuItem } from '@/components/OverflowMenuButton.vue'
import OverflowMenuButton from '@/components/OverflowMenuButton.vue'

interface Props {
  name: string
  status: TournamentStatus
  mode: TournamentMode
  isAuthenticated: boolean
  isParticipant: boolean
  canJoin: boolean
  canLeave: boolean
  canCreateMatch: boolean
  items?: OverflowMenuItem[]
  joining?: boolean
  leaving?: boolean
}

defineProps<Props>()

const emit = defineEmits<{
  join: []
  leave: []
  'create-match': []
}>()

const { t } = useI18n()

const statusLabels = computed<Record<string, string>>(() => ({
  draft: t('tournamentHeader.statusDraft'),
  open: t('tournamentHeader.statusOpen'),
  ongoing: t('tournamentHeader.statusOngoing'),
  finished: t('tournamentHeader.statusFinished'),
  cancelled: t('tournamentHeader.statusCancelled'),
}))

const statusColors: Record<string, 'neutral' | 'success' | 'warning' | 'info' | 'error'> = {
  draft: 'neutral',
  open: 'success',
  ongoing: 'warning',
  finished: 'info',
  cancelled: 'error',
}

const modeLabels = computed<Record<TournamentMode, string>>(() => ({
  championship: t('tournamentHeader.modeChampionship'),
  bracket: t('tournamentHeader.modeBracket'),
  ranked: t('tournamentHeader.modeRanked'),
}))
</script>
