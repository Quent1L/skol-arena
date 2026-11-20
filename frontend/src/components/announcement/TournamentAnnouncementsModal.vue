<template>
  <UModal
    v-model:open="open"
    :title="t('tournamentAnnouncementsModal.title')"
    :description="t('tournamentAnnouncementsModal.description')"
    :ui="{ content: 'sm:max-w-xl' }"
  >
    <template #body>
      <AnnouncementForm
        v-if="composing"
        :tournament-id="tournamentId"
        :saving="saving"
        @submit="onPublish"
        @cancel="composing = false"
      />
      <div v-else class="space-y-4">
        <UButton
          icon="i-fa7-solid:plus"
          :label="t('tournamentAnnouncementsModal.new')"
          block
          @click="composing = true"
        />
        <AnnouncementList :announcements="announcements" :loading="loading" @delete="onDelete" />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CreateAnnouncementInput } from '@skol-arena/shared'
import AnnouncementForm from './AnnouncementForm.vue'
import AnnouncementList from './AnnouncementList.vue'
import { useAnnouncementAdmin } from '@/composables/announcement/announcement.service'
import type { ClientAnnouncement } from '@/composables/announcement/announcement.api'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useAppToast } from '@/composables/useAppToast'
import { useErrorService } from '@/composables/useErrorService'

const props = defineProps<{ tournamentId: string }>()
const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const confirm = useConfirmDialog()
const toast = useAppToast()
const { showError } = useErrorService()
const { announcements, loading, saving, load, publish, remove } = useAnnouncementAdmin()
const composing = ref(false)

watch(open, (isOpen) => {
  composing.value = false
  if (isOpen) load(props.tournamentId).catch((err: Error) => showError(err))
})

async function onPublish(payload: CreateAnnouncementInput) {
  try {
    await publish(payload, props.tournamentId)
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
