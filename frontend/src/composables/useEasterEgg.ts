import { readonly, ref } from 'vue'

/**
 * `classic` asks "SKILL OR LUCK?"; `both` answers it — fired by alternating the
 * random and balanced line-up buttons, it turns the OR into an AND.
 */
export type EasterEggVariant = 'classic' | 'both'

/**
 * Module-level, like the PWA update state: the trigger lives in the header and
 * the animation is mounted at the app root, and the two never meet in the
 * component tree.
 */
const visible = ref(false)
const variant = ref<EasterEggVariant>('classic')

export function useEasterEgg() {
  return {
    visible: readonly(visible),
    variant: readonly(variant),
    play: (which: EasterEggVariant = 'classic'): void => {
      variant.value = which
      visible.value = true
    },
    stop: (): void => {
      visible.value = false
    },
  }
}
