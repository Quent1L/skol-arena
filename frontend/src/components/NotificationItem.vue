<template>
  <div class="notif-shell relative overflow-hidden rounded-xl" :class="{ 'is-armed': armed }">
    <!-- Revealed by the swipe, behind the card -->
    <div
      class="absolute inset-y-0 right-0 flex items-center justify-end pr-5 w-full rounded-xl notif-swipe-bg"
      :style="swipeBackgroundStyle"
      aria-hidden="true"
    >
      <i class="fas fa-trash text-white text-base notif-swipe-icon" :style="swipeIconStyle"></i>
    </div>

    <div
      ref="cardRef"
      :class="cardClasses"
      :style="cardStyle"
      @click="handleClick"
    >
      <span class="notif-accent" :style="{ background: accent }" aria-hidden="true"></span>

      <div class="flex gap-3">
        <div
          class="notif-avatar"
          :style="{ background: `color-mix(in srgb, ${accent} 16%, transparent)`, color: accent }"
          aria-hidden="true"
        >
          <i :class="`fas ${icon}`"></i>
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex items-start justify-between gap-2">
            <h3 class="notif-title font-semibold text-sm md:text-[0.95rem] leading-snug min-w-0">
              <span v-if="!props.notif.isRead" class="notif-dot" :style="{ background: accent }" aria-hidden="true"></span>
              {{ title }}
            </h3>
            <div class="flex items-center gap-1 flex-shrink-0">
              <span class="text-[10px] md:text-xs opacity-55 whitespace-nowrap tabular-nums">
                {{ formatDate(props.notif.createdAt) }}
              </span>
              <Button
                v-if="!blocking"
                @click="handleDelete"
                class="notif-close text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                :title="t('notificationItem.deleteTitle')"
                text
                rounded
                size="small"
              >
                <i class="fas fa-times text-xs"></i>
              </Button>
            </div>
          </div>

          <pre
            class="notif-message text-xs md:text-sm opacity-75 whitespace-pre-wrap mt-0.5"
            style="font-family: inherit"
            >{{ message }}</pre
          >

          <span v-if="blocking" class="notif-action-chip text-amber-700 dark:text-amber-300">
            <i class="fas fa-triangle-exclamation text-[9px]"></i>
            {{ t('notificationItem.actionLabel') }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Notification } from '@/composables/notification/notification.service'
import { isBlocking, useNotificationService } from '@/composables/notification/notification.service'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { computed, ref, useTemplateRef } from 'vue'
import { useAppToast } from '@/composables/useAppToast'
import { useSwipe } from '@vueuse/core'
import { useNotificationText } from '@/composables/notification/notification.i18n'

const { t, locale } = useI18n()

const props = defineProps<{ notif: Notification }>()
const { renderTitle, renderMessage } = useNotificationText()

const title = computed(() => renderTitle(props.notif))
const message = computed(() => renderMessage(props.notif))
const { open, deleteNotification } = useNotificationService()
const router = useRouter()
const toast = useAppToast()

const cardRef = useTemplateRef<HTMLElement>('cardRef')
const swipeOffset = ref(0)
const isSnapping = ref(false)
const committed = ref(false)
/** Past the threshold: the release will delete. */
const armed = ref(false)
/** Settled on the first move of a gesture — a vertical drag must stay a scroll. */
const horizontal = ref<boolean | null>(null)

const SWIPE_THRESHOLD = 96
/** Past the threshold the card keeps moving, but grudgingly. */
const RESISTANCE = 0.35
const SNAP_BACK = 'transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)'

const reducedMotion =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const blocking = computed(() => isBlocking(props.notif))
const canSwipe = computed(() => !blocking.value && !reducedMotion)

/** Type families: what the notification is about decides its icon and accent. */
const TYPE_STYLES: Record<string, { icon: string; accent: string }> = {
  MATCH_CREATED: { icon: 'fa-user-plus', accent: 'var(--p-primary-400)' },
  MATCH_SCHEDULED: { icon: 'fa-calendar-day', accent: 'var(--p-primary-400)' },
  MATCH_VALIDATION: { icon: 'fa-clipboard-check', accent: 'var(--p-amber-400)' },
  MATCH_SCORE_PROPOSAL: { icon: 'fa-pen-to-square', accent: 'var(--p-amber-400)' },
  MATCH_POST_DISPUTE: { icon: 'fa-flag', accent: 'var(--p-red-400)' },
  MATCH_DISPUTE_ESCALATED: { icon: 'fa-gavel', accent: 'var(--p-red-400)' },
  MATCH_MESSAGE: { icon: 'fa-comment-dots', accent: 'var(--p-sky-400)' },
  MATCH_RESULT_CORRECTED: { icon: 'fa-pen-to-square', accent: 'var(--p-sky-400)' },
  BADGE_AWARDED: { icon: 'fa-medal', accent: 'var(--p-yellow-400)' },
  BADGE_REVOKED: { icon: 'fa-medal', accent: 'var(--p-surface-400)' },
}
const FALLBACK_STYLE = { icon: 'fa-bell', accent: 'var(--p-primary-400)' }

const typeStyle = computed(() => TYPE_STYLES[props.notif.type] ?? FALLBACK_STYLE)
const icon = computed(() => typeStyle.value.icon)
const accent = computed(() => typeStyle.value.accent)

const cardStyle = computed(() => ({
  transform: committed.value
    ? 'translateX(-110%)'
    : `translateX(${-Math.max(0, swipeOffset.value)}px)`,
  transition: committed.value
    ? 'transform 0.24s ease-in'
    : isSnapping.value
      ? SNAP_BACK
      : 'none',
}))

const swipeProgress = computed(() =>
  Math.min(Math.max(0, swipeOffset.value) / SWIPE_THRESHOLD, 1),
)

const swipeBackgroundStyle = computed(() => ({
  opacity: String(Math.min(1, swipeProgress.value * 1.3)),
  // Grey while the gesture is undecided, red once releasing would delete
  background: armed.value ? 'var(--p-red-500)' : 'var(--p-surface-500)',
  transition: 'background 0.18s ease',
}))

const swipeIconStyle = computed(() => ({
  transform: `scale(${armed.value ? 1.15 : 0.85 + swipeProgress.value * 0.15})`,
  transition: 'transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)',
}))

const { lengthX, lengthY } = useSwipe(cardRef, {
  onSwipeStart() {
    horizontal.value = null
    committed.value = false
  },
  onSwipe() {
    if (!canSwipe.value) return
    // Let a vertical drag scroll the list instead of peeling the card open
    if (horizontal.value === null) {
      if (Math.abs(lengthX.value) < 6 && Math.abs(lengthY.value) < 6) return
      horizontal.value = Math.abs(lengthX.value) > Math.abs(lengthY.value)
    }
    if (!horizontal.value) return

    isSnapping.value = false
    const raw = Math.max(0, lengthX.value)
    swipeOffset.value =
      raw > SWIPE_THRESHOLD ? SWIPE_THRESHOLD + (raw - SWIPE_THRESHOLD) * RESISTANCE : raw

    const nowArmed = raw > SWIPE_THRESHOLD
    if (nowArmed !== armed.value) {
      armed.value = nowArmed
      if (nowArmed) navigator.vibrate?.(10)
    }
  },
  onSwipeEnd() {
    if (!canSwipe.value || !horizontal.value) return
    if (armed.value) {
      // Fly out first, then let the list collapse the row behind it
      committed.value = true
      void handleDelete(new Event('swipe'))
    } else {
      isSnapping.value = true
      swipeOffset.value = 0
    }
    armed.value = false
    horizontal.value = null
  },
})

const emit = defineEmits<{
  click: []
}>()

function formatDate(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return t('notificationItem.date.justNow')
  if (minutes < 60) return t('notificationItem.date.minutesAgo', { minutes })
  if (hours < 24) return t('notificationItem.date.hoursAgo', { hours })
  if (days < 7) return t('notificationItem.date.daysAgo', { days })

  // Full format for older notifications
  return date.toLocaleDateString(locale.value, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function handleClick() {
  emit('click')
  open(props.notif, router)
}

async function handleDelete(event: Event) {
  event.stopPropagation()
  try {
    await deleteNotification(props.notif.id)
    toast.add({
      severity: 'success',
      summary: t('notificationItem.toast.deleted'),
      life: 2000,
    })
  } catch (error) {
    committed.value = false
    isSnapping.value = true
    swipeOffset.value = 0
    const message = error instanceof Error ? error.message : t('notificationItem.toast.deleteError')
    toast.add({
      severity: 'error',
      summary: t('notificationItem.toast.error'),
      detail: message,
      life: 3000,
    })
  }
}

const cardClasses = computed(() => [
  'notif-card relative p-3 pl-4 rounded-xl border cursor-pointer select-none',
  props.notif.isRead
    ? 'bg-white border-gray-200 dark:bg-gray-800/80 dark:border-gray-700'
    : 'bg-white border-gray-200 dark:bg-gray-800 dark:border-gray-600',
  blocking.value ? 'notif-card--blocking' : '',
])
</script>

<style scoped>
.notif-card {
  transition:
    box-shadow 0.2s ease,
    border-color 0.2s ease,
    background 0.2s ease;
  will-change: transform;
}

.notif-card:hover {
  box-shadow: 0 6px 18px -12px rgb(0 0 0 / 0.45);
}

/* The accent bar: a colour on the edge says what the notification is about before
   a word is read, and doubles as the unread marker. */
.notif-accent {
  position: absolute;
  inset-block: 0.5rem;
  left: 0;
  width: 3px;
  border-radius: 999px;
  opacity: 0.85;
}

.notif-card--blocking .notif-accent {
  inset-block: 0.25rem;
  width: 4px;
  opacity: 1;
}

.notif-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  font-size: 0.8rem;
}

.notif-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  margin-right: 0.35rem;
  vertical-align: middle;
}

.notif-action-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-top: 0.4rem;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  background: color-mix(in srgb, var(--p-amber-400) 18%, transparent);
}

.notif-close {
  opacity: 0;
  transition: opacity 0.15s ease;
}

.notif-shell:hover .notif-close,
.notif-close:focus-visible {
  opacity: 1;
}

/* Touch has no hover: the button would never appear otherwise (swipe still works) */
@media (hover: none) {
  .notif-close {
    opacity: 0.6;
  }
}

@media (prefers-reduced-motion: reduce) {
  .notif-card,
  .notif-swipe-bg,
  .notif-swipe-icon {
    transition: none !important;
  }
}
</style>
