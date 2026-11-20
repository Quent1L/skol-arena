<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { useNotificationService } from '@/composables/notification/notification.service'
import { useNotificationSocket } from '@/composables/notification/notification.socket'
import { useAuth } from '@/composables/useAuth'
import { useAnnouncementPopups } from '@/composables/announcement/announcement.service'
import { useVotePrompt } from '@/composables/votes/useVotePrompt'

const { load } = useNotificationService()
const { connect, disconnect } = useNotificationSocket()
const { isAuthenticated } = useAuth()
const announcementPopups = useAnnouncementPopups()
const votePrompt = useVotePrompt()

// Watch authentication status and handle connection/disconnection
watch(isAuthenticated, (authenticated) => {
  if (authenticated) {
    void load()
    // App-wide announcements show once at launch; a tournament's when it is opened.
    announcementPopups.loadPending()
    connect()
  } else {
    announcementPopups.clear()
    // The next account on this device must not get this player's question.
    votePrompt.close()
    disconnect()
  }
}, { immediate: true })

onBeforeUnmount(() => {
  disconnect()
})
</script>

<template>
  <slot />
</template>
