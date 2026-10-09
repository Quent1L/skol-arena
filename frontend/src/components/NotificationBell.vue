<script setup lang="ts">
import { useNotificationService } from '@/composables/notification/notification.service'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { unreadCount } = useNotificationService()
</script>

<template>
  <!-- A plain trigger: NotificationDropdown decides between the popover and the page. -->
  <UButton :aria-label="t('notificationBell.ariaLabel')" color="neutral" variant="ghost" class="px-3">
    <UChip
      :show="unreadCount > 0"
      :text="unreadCount"
      color="error"
      size="3xl"
      :ui="{ base: 'text-[10px] font-bold px-1' }"
    >
      <span class="fa fa-bell text-highlighted" style="font-size: 1.3rem" />
    </UChip>
  </UButton>
</template>
