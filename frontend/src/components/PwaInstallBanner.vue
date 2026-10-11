<template>
  <Transition name="slide-up">
    <div
      v-if="shouldShowBanner"
      class="install-banner flex items-center justify-between gap-3"
      :class="{ 'above-nav': hasBottomNav }"
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
      class="install-banner"
      :class="{ 'above-nav': hasBottomNav }"
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
import { useBottomNavPresence } from '@/composables/ui/useBottomNav'

const { t } = useI18n()
const { shouldShowBanner, showIOSInstructions, triggerInstall, dismissBanner } = usePWAInstall()
const hasBottomNav = useBottomNavPresence()

function handleDismiss() {
  dismissBanner()
}
</script>

<style scoped>
/* Flush with the bottom edge, padded past the home indicator. When a bottom nav
   is on screen the banner rests on top of it instead (same height contract as
   MobileBottomNav), and the nav already absorbs the safe area. It also slips one
   layer under the nav, so the nav's raised "create" button stays on top of it. */
.install-banner {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 50;
  padding: 0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom));
  background: var(--ui-color-neutral-700);
  box-shadow: 0 -4px 12px rgb(0 0 0 / 0.25);
}

.install-banner.above-nav {
  bottom: calc(4rem + env(safe-area-inset-bottom));
  padding-bottom: 0.75rem;
  z-index: 40;
}
</style>
