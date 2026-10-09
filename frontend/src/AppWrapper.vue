<template>
  <div class="min-h-screen main-app">
    <NotificationsInit>
      <AppHeader v-if="route.name !== 'offline'" />
      <BreadcrumbMenu v-if="route.name !== 'offline' && !isMobile && !route.meta.hideBreadcrumb" />
      <RouterView v-slot="{ Component }">
        <Transition name="fade" mode="out-in" appear>
          <component :is="Component" :key="routeKey" />
        </Transition>
      </RouterView>
      <PwaInstallBanner />
      <UpdateNotice />
    </NotificationsInit>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { useTitle } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const route = useRoute()

const pageTitle = computed(() =>
  route.meta.title
    ? t('appWrapper.pageTitle', { title: route.meta.title })
    : t('appWrapper.appTitle'),
)
useTitle(pageTitle)

// Use the parent (first matched) route's resolved path as the component key.
// This prevents remounting the parent component when only a child route (e.g. a tab) changes.
// For leaf routes (no children), falls back to route.path for the usual per-page remount behaviour.
const routeKey = computed(() => {
  const { matched, params, path } = route
  if (matched.length <= 1) return path
  const parentPath = matched[0].path
  return parentPath.replace(/:([^/]+)/g, (_, p) => (params[p] as string) ?? '')
})
import AppHeader from '@/components/AppHeader.vue'
import BreadcrumbMenu from '@/components/BreadcrumbMenu.vue'
import NotificationsInit from '@/components/NotificationsInit.vue'
import PwaInstallBanner from '@/components/PwaInstallBanner.vue'
import { usePageTransitions } from '@/utils/transitions'
import { useViewport } from '@/composables/useViewport'

const { isMobile } = useViewport()
usePageTransitions()
</script>

<style>
/* Transitions de base */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  will-change: opacity;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Transition glissement horizontal (vers la droite) */
.slide-left-enter-active,
.slide-left-leave-active {
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-left-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.slide-left-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}

/* Transition glissement horizontal (vers la gauche - retour) */
.slide-right-enter-active,
.slide-right-leave-active {
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-right-enter-from {
  transform: translateX(-100%);
  opacity: 0;
}

.slide-right-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

/* Vertical slide transition (upward) */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-up-enter-from {
  transform: translateY(100%);
  opacity: 0;
}

.slide-up-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}

/* Vertical slide transition (downward) */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-down-enter-from {
  transform: translateY(-100%);
  opacity: 0;
}

.slide-down-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

/* Zoom transition (enlarging) */
.zoom-enter-active,
.zoom-leave-active {
  transition: all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.zoom-enter-from {
  transform: scale(0.85);
  opacity: 0;
}

.zoom-leave-to {
  transform: scale(1.15);
  opacity: 0;
}

/* Zoom out transition (shrinking) */
.zoom-out-enter-active,
.zoom-out-leave-active {
  transition: all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.zoom-out-enter-from {
  transform: scale(1.15);
  opacity: 0;
}

.zoom-out-leave-to {
  transform: scale(0.85);
  opacity: 0;
}

/* Rotation transition (for special effects) */
.rotate-enter-active,
.rotate-leave-active {
  transition: all 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

.rotate-enter-from {
  transform: rotate(-10deg) scale(0.9);
  opacity: 0;
}

.rotate-leave-to {
  transform: rotate(10deg) scale(0.9);
  opacity: 0;
}

/* Fade effect with blur */
.blur-enter-active,
.blur-leave-active {
  transition: all 0.4s ease;
}

.blur-enter-from,
.blur-leave-to {
  opacity: 0;
  filter: blur(10px);
  transform: scale(1.05);
}

/* Positioning to avoid layout issues */
.slide-left-enter-active,
.slide-left-leave-active,
.slide-right-enter-active,
.slide-right-leave-active,
.slide-up-enter-active,
.slide-up-leave-active,
.slide-down-enter-active,
.slide-down-leave-active {
  position: absolute;
  width: 100%;
  top: 0;
  left: 0;
  min-height: 100vh;
}

/* Container to avoid positioning issues */
#app {
  position: relative;
  overflow-x: clip; /* clip (not hidden) avoids creating a scroll container, which would break position:sticky */
}

/* Performance improvement */
.slide-left-enter-active,
.slide-left-leave-active,
.slide-right-enter-active,
.slide-right-leave-active,
.slide-up-enter-active,
.slide-up-leave-active,
.slide-down-enter-active,
.slide-down-leave-active,
.zoom-enter-active,
.zoom-leave-active,
.zoom-out-enter-active,
.zoom-out-leave-active {
  will-change: transform, opacity;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

/* Responsive: reduce animations on mobile for better performance */
@media (max-width: 768px) {
  .slide-left-enter-active,
  .slide-left-leave-active,
  .slide-right-enter-active,
  .slide-right-leave-active,
  .slide-up-enter-active,
  .slide-up-leave-active,
  .slide-down-enter-active,
  .slide-down-leave-active {
    transition-duration: 0.3s;
  }
}

/* Reduce animations if the user prefers less motion */
@media (prefers-reduced-motion: reduce) {
  .slide-left-enter-active,
  .slide-left-leave-active,
  .slide-right-enter-active,
  .slide-right-leave-active,
  .slide-up-enter-active,
  .slide-up-leave-active,
  .slide-down-enter-active,
  .slide-down-leave-active,
  .zoom-enter-active,
  .zoom-leave-active,
  .zoom-out-enter-active,
  .zoom-out-leave-active {
    transition-duration: 0.1s;
    transform: none !important;
  }
}
</style>
