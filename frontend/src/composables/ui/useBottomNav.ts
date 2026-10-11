import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

// Counter rather than a boolean: during a route transition the outgoing and the
// incoming page can both hold a bottom nav for a moment.
const mountedNavs = ref(0)

/** Declares that the calling component renders a fixed bottom nav while mounted. */
export function registerBottomNav() {
  onMounted(() => mountedNavs.value++)
  onBeforeUnmount(() => mountedNavs.value--)
}

/** Whether a fixed bottom nav is currently on screen, for overlays that must sit above it. */
export function useBottomNavPresence() {
  return computed(() => mountedNavs.value > 0)
}
