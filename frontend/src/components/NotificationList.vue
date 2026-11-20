<script setup lang="ts">
import {
  NOTIFICATION_PAGE_SIZE,
  useNotificationService,
} from '@/composables/notification/notification.service'
import { useI18n } from 'vue-i18n'
import { ref } from 'vue'
import { useInfiniteScroll } from '@vueuse/core'
import NotificationItem from './NotificationItem.vue'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{ constrained?: boolean; scrollMode?: 'container' | 'window' }>(),
  { constrained: false, scrollMode: 'window' },
)

const { notifications, loading, loadingMore, hasMore, loadMore } = useNotificationService()

const container = ref<HTMLElement | null>(null)

useInfiniteScroll(
  () => (props.scrollMode === 'window' ? window : container.value),
  async () => {
    await loadMore()
  },
  {
    distance: 120,
    canLoadMore: () => hasMore.value && !loadingMore.value && !loading.value,
  },
)

const emit = defineEmits<{
  close: []
}>()

function handleNotificationClick() {
  emit('close')
}

/**
 * Staggered entrance, capped at one page: appended items cascade, but the delay never
 * grows with the length of the feed.
 */
function enterDelay(index: number): string {
  return `${(index % NOTIFICATION_PAGE_SIZE) * 30}ms`
}
</script>

<template>
  <div
    ref="container"
    class="p-4 space-y-3"
    :class="{ 'max-h-[60vh] overflow-y-auto': props.constrained }"
  >
    <TransitionGroup name="notif" tag="div" class="space-y-3" appear>
      <NotificationItem
        v-for="(n, index) in notifications"
        :key="n.id"
        :notif="n"
        :style="{ transitionDelay: enterDelay(index) }"
        @click="handleNotificationClick"
      />
    </TransitionGroup>

    <!-- First load: the shape of the list before its content -->
    <div v-if="loading && notifications.length === 0" class="space-y-3">
      <div
        v-for="i in 3"
        :key="`sk-${i}`"
        class="notif-skeleton sk-shimmer bg-slate-200 dark:bg-slate-700"
      ></div>
    </div>

    <div v-else-if="loadingMore" class="space-y-3 pt-1">
      <div
        v-for="i in 2"
        :key="`sk-more-${i}`"
        class="notif-skeleton sk-shimmer bg-slate-200 dark:bg-slate-700"
      ></div>
    </div>

    <p v-else-if="notifications.length === 0" class="text-center text-xs opacity-60 py-4">
      {{ t('notificationList.empty') }}
    </p>

    <p
      v-else-if="!hasMore && notifications.length > NOTIFICATION_PAGE_SIZE"
      class="text-center text-[11px] opacity-45 py-3"
    >
      {{ t('notificationList.endOfList') }}
    </p>
  </div>
</template>

<style scoped>
.notif-skeleton {
  height: 4.25rem;
  border-radius: 0.75rem;
  opacity: 0.55;
}

/* Entrance: the list assembles itself instead of appearing all at once */
.notif-enter-active {
  transition:
    opacity 0.32s ease-out,
    transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}

.notif-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

/* Leave: the row collapses behind the card that has already swiped away, so the ones
   below it slide up rather than snapping. */
.notif-leave-active {
  transition:
    opacity 0.24s ease-in,
    transform 0.24s ease-in,
    max-height 0.28s ease-in,
    margin 0.28s ease-in;
  overflow: hidden;
  max-height: 12rem;
  position: relative;
}

.notif-leave-to {
  opacity: 0;
  transform: translateX(-16px);
  max-height: 0;
  margin-top: 0 !important;
  margin-bottom: 0 !important;
}

.notif-move {
  transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

@media (prefers-reduced-motion: reduce) {
  .notif-enter-active,
  .notif-leave-active,
  .notif-move {
    transition-duration: 0.01ms !important;
    transition-delay: 0ms !important;
  }
}
</style>
