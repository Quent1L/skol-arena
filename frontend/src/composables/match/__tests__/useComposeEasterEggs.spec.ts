import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { DUEL_TAPS, useComposeEasterEggs } from '../useComposeEasterEggs'
import { useEasterEgg } from '@/composables/useEasterEgg'

beforeEach(() => {
  useEasterEgg().stop()
})

afterEach(() => {
  vi.useRealTimers()
})

const alternate = (onCompose: (kind: 'random' | 'balanced') => void, taps: number) => {
  for (let i = 0; i < taps; i += 1) onCompose(i % 2 === 0 ? 'random' : 'balanced')
}

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

  it('stays quiet until a single tap is left', () => {
    const { onCompose, armedKind } = useComposeEasterEggs()

    alternate(onCompose, DUEL_TAPS - 2)
    expect(armedKind.value).toBeNull()
  })

  it('disarms when the same button is tapped again', () => {
    const { onCompose, armedKind } = useComposeEasterEggs()

    alternate(onCompose, DUEL_TAPS - 1)
    onCompose('random')
    expect(armedKind.value).toBeNull()
  })

  it('names the button that fires the overlay and clears once it plays', () => {
    const { onCompose, armedKind } = useComposeEasterEggs()

    alternate(onCompose, DUEL_TAPS - 1)
    // An odd number of taps starting on `random` ends on `random`.
    expect(armedKind.value).toBe('balanced')

    onCompose('balanced')
    expect(useEasterEgg().visible.value).toBe(true)
    expect(armedKind.value).toBeNull()
  })

  it('disarms when the tap window lapses', () => {
    vi.useFakeTimers()
    const { onCompose, armedKind } = useComposeEasterEggs()

    alternate(onCompose, DUEL_TAPS - 1)
    expect(armedKind.value).not.toBeNull()

    vi.runAllTimers()
    expect(armedKind.value).toBeNull()
  })
})
