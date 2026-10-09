import { ref } from 'vue'

/**
 * Set while the update notice flies its "what's new" dot onto the avatar. The header
 * keeps its own dot hidden meanwhile, so the two never show at once; it appears the
 * moment the flying one lands.
 */
const inFlight = ref(false)

export function useWhatsNewDotFlight() {
  return { inFlight }
}
