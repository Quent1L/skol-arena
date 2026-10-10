<script setup lang="ts">
import NotificationList from '@/components/NotificationList.vue'
import { useNotificationService } from '@/composables/notification/notification.service'
import { computed, onMounted } from 'vue'
import { useAppToast } from '@/composables/useAppToast'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { load, notifications, unreadCount, hasDeletable, markAllAsRead, deleteAll } =
  useNotificationService()
const toast = useAppToast()

const hasDeletableNotifs = hasDeletable
const hasUnreadNotifs = computed(() => unreadCount.value > 0)

onMounted(() => {
  void load()
})

async function handleMarkAllAsRead() {
  try {
    await markAllAsRead()
    toast.add({ severity: 'success', summary: t('notificationsView.markAllReadSuccess'), life: 2000 })
  } catch {
    toast.add({ severity: 'error', summary: t('notificationsView.errorSummary'), detail: t('notificationsView.markAllReadError'), life: 3000 })
  }
}

async function handleDeleteAll() {
  try {
    const { kept } = await deleteAll()
    toast.add({
      severity: 'success',
      summary: t('notificationsView.deleteAllSuccess'),
      detail: kept > 0 ? t('notificationsView.deleteAllKept', kept) : undefined,
      life: kept > 0 ? 3500 : 2000,
    })
  } catch {
    toast.add({ severity: 'error', summary: t('notificationsView.errorSummary'), detail: t('notificationsView.deleteAllError'), life: 3000 })
  }
}
</script>

<template>
  <div class="max-w-xl mx-auto w-full mt-4">
    <div class="flex items-center justify-between gap-3 mb-4">
      <div class="flex items-center gap-3">
        <h2 class="text-lg font-semibold">{{ t('notificationsView.title') }}</h2>
      </div>
      <div v-if="notifications.length > 0" class="flex items-center gap-2">
        <UButton
          icon="i-fa7-solid:check-double"
          :label="t('notificationsView.markAllRead')"
          variant="ghost"
          size="xs"
          class="rounded-full"
          :disabled="!hasUnreadNotifs"
          @click="handleMarkAllAsRead"
        />
        <UButton
          icon="i-fa7-solid:trash"
          :label="t('notificationsView.deleteAll')"
          color="error"
          variant="ghost"
          size="xs"
          class="rounded-full"
          :disabled="!hasDeletableNotifs"
          @click="handleDeleteAll"
        />
      </div>
    </div>
    <NotificationList scroll-mode="window" />
  </div>
</template>
