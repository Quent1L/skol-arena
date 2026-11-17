<template>
  <div>
    <div v-if="loading" class="space-y-3">
      <USkeleton v-for="i in 3" :key="i" class="h-20 w-full" />
    </div>
    <p v-else-if="announcements.length === 0" class="py-6 text-center text-sm text-muted">
      {{ t('announcementList.empty') }}
    </p>
    <ul v-else class="space-y-3">
      <li
        v-for="a in announcements"
        :key="a.id"
        class="rounded-lg border border-default p-3"
        data-testid="announcement-row"
      >
        <div class="flex items-start gap-2">
          <div class="min-w-0 flex-1">
            <p class="font-medium text-highlighted break-words">{{ a.title }}</p>
            <p class="mt-1 line-clamp-2 text-sm text-muted whitespace-pre-line break-words">
              {{ a.body }}
            </p>
          </div>
          <UButton
            icon="i-fa7-solid:trash-can"
            color="error"
            variant="ghost"
            size="sm"
            :aria-label="t('common.delete')"
            @click="emit('delete', a)"
          />
        </div>
        <div class="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <UBadge
            :label="a.audience === 'all' ? t('announcementList.audienceAll') : (a.tournamentName ?? t('announcementList.audienceTournament'))"
            :icon="a.audience === 'all' ? 'i-fa7-solid:globe' : 'i-fa7-solid:trophy'"
            color="neutral"
            variant="subtle"
            size="sm"
          />
          <UBadge v-if="a.inFeed" :label="t('announcementList.inFeed', { count: a.recipientCount })" icon="i-fa7-solid:bell" color="neutral" variant="subtle" size="sm" />
          <UBadge v-if="a.asPopup" :label="t('announcementList.asPopup', { count: a.seenCount })" icon="i-fa7-solid:window-maximize" color="neutral" variant="subtle" size="sm" />
          <span class="ms-auto">
            {{ formatDate(a.createdAt) }}<template v-if="a.authorName"> · {{ a.authorName }}</template>
          </span>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ClientAnnouncement } from '@/composables/announcement/announcement.api'

defineProps<{ announcements: ClientAnnouncement[]; loading?: boolean }>()
const emit = defineEmits<{ delete: [announcement: ClientAnnouncement] }>()

const { t, locale } = useI18n()

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString(locale.value, { day: 'numeric', month: 'short', year: 'numeric' })
}
</script>
