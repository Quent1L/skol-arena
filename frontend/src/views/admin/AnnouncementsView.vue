<template>
  <div>
    <AdminPageHeader
      :title="t('announcementsView.title')"
      :description="t('announcementsView.subtitle')"
    >
      <template #actions>
        <UButton
          :label="t('announcementsView.new')"
          icon="i-fa7-solid:plus"
          @click="composing = true"
        />
      </template>
    </AdminPageHeader>

    <UCard>
      <AnnouncementList :announcements="announcements" :loading="loading" @delete="onDelete" />
    </UCard>

    <UModal
      v-model:open="composing"
      :title="t('announcementsView.new')"
      :ui="{ content: 'sm:max-w-xl' }"
    >
      <template #body>
        <AnnouncementForm
          allow-global
          :tournament-options="tournamentOptions"
          :saving="saving"
          @submit="onPublish"
          @cancel="composing = false"
        />
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CreateAnnouncementInput } from '@skol-arena/shared'
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import AnnouncementForm from '@/components/announcement/AnnouncementForm.vue'
import AnnouncementList from '@/components/announcement/AnnouncementList.vue'
import { useAnnouncementAdmin } from '@/composables/announcement/announcement.service'
import type { ClientAnnouncement } from '@/composables/announcement/announcement.api'
import { useTournamentService } from '@/composables/tournament/tournament.service'
import { useRankedService } from '@/composables/ranked/ranked.service'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useAppToast } from '@/composables/useAppToast'
import { useErrorService } from '@/composables/useErrorService'

const { t } = useI18n()
const confirm = useConfirmDialog()
const toast = useAppToast()
const { showError } = useErrorService()
const { announcements, loading, saving, load, publish, remove } = useAnnouncementAdmin()
const { tournaments, listTournaments } = useTournamentService()
const { seasons, loadSeasons } = useRankedService()
const composing = ref(false)

// The tournament list leaves ranked seasons out, yet a season is a tournament row too:
// its players are reached the same way, so offer both, seasons flagged by their icon.
const toOptions = (list: typeof tournaments.value, icon?: string) =>
  list
    .filter((tournament) => tournament.status !== 'finished')
    .map((tournament) => ({ label: tournament.name, value: tournament.id, icon }))

const tournamentOptions = computed(() => [
  ...toOptions(tournaments.value),
  ...toOptions(seasons.value, 'i-fa7-solid:ranking-star'),
])

watch(composing, (isOpen) => {
  if (isOpen && tournaments.value.length === 0) {
    listTournaments().catch((err: Error) => showError(err))
  }
  // loadSeasons keeps its own error state instead of throwing
  if (isOpen && seasons.value.length === 0) void loadSeasons()
})

onMounted(() => {
  load().catch((err: Error) => showError(err))
})

async function onPublish(payload: CreateAnnouncementInput) {
  try {
    await publish(payload)
  } catch (err) {
    showError(err as Error) // the draft stays on screen
    return
  }
  composing.value = false
  toast.add({ severity: 'success', summary: t('announcementForm.published') })
}

async function onDelete(announcement: ClientAnnouncement) {
  const confirmed = await confirm({
    title: t('announcementList.deleteTitle'),
    message: t('announcementList.deleteMessage', { title: announcement.title }),
    confirmLabel: t('common.delete'),
    color: 'error',
  })
  if (confirmed) await remove(announcement.id).catch((err: Error) => showError(err))
}
</script>
