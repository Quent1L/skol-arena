<template>
  <UModal
    :open="visible"
    :dismissible="false"
    :close="false"
    :ui="{ content: 'sm:max-w-lg', footer: 'flex justify-end' }"
  >
    <template #header>
      <div class="flex items-start gap-3">
        <div class="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
          <UIcon name="i-fa7-solid:bullhorn" class="size-5 text-primary" />
        </div>
        <div class="min-w-0">
          <p class="text-xs font-medium uppercase tracking-wide text-primary">
            {{ t('announcementPopup.kicker') }}
          </p>
          <h2
            class="text-lg font-semibold text-highlighted break-words"
            data-testid="announcement-title"
          >
            {{ current?.title }}
          </h2>
        </div>
      </div>
    </template>
    <template #body>
      <p
        class="text-sm text-default whitespace-pre-line break-words"
        data-testid="announcement-body"
      >
        {{ current?.body }}
      </p>
    </template>
    <template #footer>
      <UButton
        :label="
          remaining > 0
            ? t('announcementPopup.next', { count: remaining })
            : t('announcementPopup.gotIt')
        "
        block
        class="sm:w-auto"
        data-testid="announcement-dismiss"
        @click="dismissCurrent"
      />
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAnnouncementPopups } from '@/composables/announcement/announcement.service'
import { screenTakenOver, waitForFreeScreen } from '@/composables/useScreenTakeover'

/**
 * The single host of every announcement pop-up, app-wide or a tournament's. It waits
 * for the screen to settle and steps aside while a full-screen moment (MMR recap,
 * badge reveal, rewind) is playing, then comes back.
 */
const props = withDefaults(defineProps<{ settleMs?: number }>(), { settleMs: 800 })

const { t } = useI18n()
const { current, remaining, dismissCurrent } = useAnnouncementPopups()

const settled = ref(false)

watch(
  () => current.value?.id,
  async (id) => {
    if (!id || settled.value) return
    await waitForFreeScreen(props.settleMs)
    settled.value = true
  },
  { immediate: true },
)

const visible = computed(() => !!current.value && settled.value && !screenTakenOver.value)
</script>
