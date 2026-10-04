import { computed, ref } from 'vue'
import { useEasterEgg } from '@/composables/useEasterEgg'
import { useSecretTap } from '@/composables/useSecretTap'

export type ComposeKind = 'random' | 'balanced'

/** Random ↔ balanced switches in a row before skill and luck make peace. */
export const DUEL_TAPS = 6

/**
 * Alternating the random and balanced line-up buttons — buttons never meant to
 * be spammed — makes the app-wide "SKILL OR LUCK?" overlay answer its own
 * question. The line-up is applied on every tap regardless.
 */
export function useComposeEasterEggs() {
  const { play } = useEasterEgg()
  const duel = useSecretTap(DUEL_TAPS, () => play('both'))
  const lastKind = ref<ComposeKind | null>(null)

  function onCompose(kind: ComposeKind): void {
    // Only a switch counts towards the duel: the same button twice starts over.
    if (kind === lastKind.value) duel.reset()
    lastKind.value = kind
    duel.tap()
  }

  /**
   * The button whose next tap plays the overlay, so the step can warn before
   * the screen is taken over. Clears with the tap window like the count does.
   */
  const armedKind = computed<ComposeKind | null>(() => {
    if (duel.count.value !== DUEL_TAPS - 1) return null
    return lastKind.value === 'random' ? 'balanced' : 'random'
  })

  return { onCompose, armedKind }
}
