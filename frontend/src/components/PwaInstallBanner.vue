<template>
  <Transition name="slide-up">
    <div
      v-if="shouldShowBanner"
      class="fixed bottom-15 left-0 right-0 z-50 flex items-center justify-between gap-3 px-4 py-3 shadow-lg"
      style="background: var(--ui-color-neutral-700)"
    >
      <div class="flex items-center gap-3 min-w-0">
        <img src="/icons/icon-192.png" alt="Skol Arena" class="w-10 h-10 rounded-xl shrink-0" />
        <div class="min-w-0">
          <p class="font-semibold text-sm leading-tight">{{ t('pwaInstallBanner.title') }}</p>
          <p class="text-xs opacity-60 truncate">{{ t('pwaInstallBanner.subtitle') }}</p>
        </div>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <UButton size="sm" :label="t('pwaInstallBanner.installButton')" icon="i-fa7-solid:download" @click="triggerInstall" />
        <UButton
          size="sm"
          icon="i-fa7-solid:xmark"
          color="neutral"
          variant="ghost"
          :aria-label="t('common.close')"
          @click="handleDismiss"
        />
      </div>
    </div>
  </Transition>

  <Transition name="fade">
    <div
      v-if="showIOSInstructions"
      class="fixed bottom-15 left-0 right-0 z-50 px-4 py-3 shadow-lg"
      style="background: var(--ui-color-neutral-700);"
    >
      <div class="flex items-start justify-between gap-2">
        <p class="text-sm">
          {{ t('pwaInstallBanner.iosInstruction.tapOn') }}
          <i class="fas fa-share-from-square mx-1"></i>
          {{ t('pwaInstallBanner.iosInstruction.then') }} <strong>{{ t('pwaInstallBanner.iosInstruction.addToHomeScreen') }}</strong>
        </p>
        <UButton
          size="sm"
          icon="i-fa7-solid:xmark"
          color="neutral"
          variant="ghost"
          :aria-label="t('common.close')"
          @click="showIOSInstructions = false"
        />
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { usePWAInstall } from '@/composables/pwa/pwa.install'

const { t } = useI18n()
const { shouldShowBanner, showIOSInstructions, triggerInstall, dismissBanner } = usePWAInstall()

function handleDismiss() {
  dismissBanner()
}
</script>
