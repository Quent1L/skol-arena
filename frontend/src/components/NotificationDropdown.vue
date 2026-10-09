<script setup lang="ts">
import NotificationList from './NotificationList.vue'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useNotificationService } from '@/composables/notification/notification.service'
import { useAppToast } from '@/composables/useAppToast'

const { t } = useI18n()

const open = ref(false)
const router = useRouter()
const { notifications, unreadCount, hasDeletable, markAllAsRead, deleteAll } =
  useNotificationService()
const toast = useAppToast()

const hasNotifications = computed(() => notifications.value.length > 0)
const hasDeletableNotifs = hasDeletable
const hasUnreadNotifs = computed(() => unreadCount.value > 0)

/** On a phone the list gets a page of its own rather than a cramped popover. */
function onOpenChange(value: boolean) {
  if (value && window.innerWidth < 640) {
    router.push('/notifications')
    return
  }
  open.value = value
}

function close() {
  open.value = false
}

function viewAll() {
  close()
  router.push('/notifications')
}

async function handleMarkAllAsRead() {
  try {
    await markAllAsRead()
    toast.add({
      severity: 'success',
      summary: t('notificationDropdown.toast.markAllSuccess'),
      life: 2000,
    })
  } catch {
    toast.add({
      severity: 'error',
      summary: t('notificationDropdown.toast.error'),
      detail: t('notificationDropdown.toast.markAllError'),
      life: 3000,
    })
  }
}

async function handleDeleteAll() {
  try {
    const { kept } = await deleteAll()
    toast.add({
      severity: 'success',
      summary: t('notificationDropdown.toast.deleteAllSuccess'),
      detail: kept > 0 ? t('notificationDropdown.toast.deleteAllKept', kept) : undefined,
      life: kept > 0 ? 3500 : 2000,
    })
  } catch {
    toast.add({
      severity: 'error',
      summary: t('notificationDropdown.toast.error'),
      detail: t('notificationDropdown.toast.deleteAllError'),
      life: 3000,
    })
  }
}

</script>

<template>
  <UPopover :open="open" :content="{ align: 'end', sideOffset: 8 }" @update:open="onOpenChange">
    <slot />

    <template #content>
      <div class="w-[90vw] sm:w-96 p-3">
        <div class="flex justify-between items-center pb-3 border-b border-default">
          <h3 class="font-semibold">{{ t('notificationDropdown.title') }}</h3>
          <div v-if="hasNotifications" class="flex items-center gap-1">
            <UTooltip
              :text="hasUnreadNotifs ? t('notificationDropdown.markAllAsRead') : t('notificationDropdown.allAlreadyRead')"
            >
              <UButton
                icon="i-fa7-solid:check-double"
                color="neutral"
                variant="ghost"
                size="sm"
                class="rounded-full"
                :disabled="!hasUnreadNotifs"
                :aria-label="t('notificationDropdown.markAllAsRead')"
                @click="handleMarkAllAsRead"
              />
            </UTooltip>
            <UTooltip
              :text="hasDeletableNotifs ? t('notificationDropdown.deleteAll') : t('notificationDropdown.actionNotifsCantDelete')"
            >
              <UButton
                icon="i-fa7-solid:trash"
                color="error"
                variant="ghost"
                size="sm"
                class="rounded-full"
                :disabled="!hasDeletableNotifs"
                :aria-label="t('notificationDropdown.deleteAll')"
                @click="handleDeleteAll"
              />
            </UTooltip>
            <UButton
              variant="ghost"
              size="sm"
              :label="t('notificationDropdown.viewAll')"
              @click="viewAll"
            />
          </div>
        </div>
        <NotificationList :constrained="true" scroll-mode="container" @close="close" />
      </div>
    </template>
  </UPopover>
</template>
