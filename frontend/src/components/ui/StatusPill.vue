<template>
  <Transition name="pill-fade">
    <div v-if="visible" class="status-pill" role="status" aria-live="polite">
      <slot />
    </div>
  </Transition>
</template>

<script setup lang="ts">
/**
 * The small pill at the top of the viewport through which the app reports on its own
 * state: a background refresh, an update that just landed. It never hides or dims the
 * content and takes no input.
 *
 * Deliberately not a toast: `useAppToast` swallows every non-error toast on mobile,
 * which is exactly where these need saying. The header does not stick, so the top of
 * the viewport is the only spot that stays visible however far down the page is read.
 */
defineProps<{ visible: boolean }>()
</script>

<style scoped>
.status-pill {
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  /* Under the toasts and far under the brand overlays (9999+). */
  z-index: 900;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
  color: #ede9fe;
  background: rgba(30, 27, 55, 0.92);
  border: 1px solid rgba(167, 139, 250, 0.35);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(6px);
  pointer-events: none;
}

.pill-fade-enter-active,
.pill-fade-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}

.pill-fade-enter-from,
.pill-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -8px);
}
</style>
