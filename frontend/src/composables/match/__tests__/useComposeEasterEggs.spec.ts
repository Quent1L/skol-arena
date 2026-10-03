import { describe, it, expect, beforeEach } from 'vitest'
import { DUEL_TAPS, useComposeEasterEggs } from '../useComposeEasterEggs'
import { useEasterEgg } from '@/composables/useEasterEgg'

beforeEach(() => {
  useEasterEgg().stop()
})

describe('useComposeEasterEggs', () => {
  it('alternating both buttons plays the "both" overlay', () => {
    const { onCompose } = useComposeEasterEggs()
    const egg = useEasterEgg()

    for (let i = 0; i < DUEL_TAPS; i += 1) onCompose(i % 2 === 0 ? 'random' : 'balanced')

    expect(egg.visible.value).toBe(true)
    expect(egg.variant.value).toBe('both')
  })

  it('the same button twice restarts the duel', () => {
    const { onCompose } = useComposeEasterEggs()
    const egg = useEasterEgg()

    for (let i = 0; i < DUEL_TAPS - 1; i += 1) onCompose(i % 2 === 0 ? 'random' : 'balanced')
    // Last tap was `random`; repeating it breaks the alternation.
    onCompose('random')

    expect(egg.visible.value).toBe(false)
  })

  it('spamming a single button never plays the overlay', () => {
    const { onCompose } = useComposeEasterEggs()

    for (let i = 0; i < DUEL_TAPS * 3; i += 1) onCompose('random')

    expect(useEasterEgg().visible.value).toBe(false)
  })
})
