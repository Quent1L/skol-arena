import { ref, type Ref } from 'vue'
import { useTimedSequence, type SequenceStep } from '@/composables/ui/useTimedSequence'
import { prefersReducedMotion } from '@/composables/ui/reduced-motion'
import type { MmrBarSegment } from './mmr-progress'

export interface MmrBarTiming {
  /** Beat before the bar starts moving at all. */
  entry: number
  /** How long one segment takes to travel. */
  segment: number
  /** Flash held once a tier is cleared. */
  flash: number
  /** Room for whatever the tier change animates (a badge swap) before the next segment. */
  swap: number
  /** Beat between the last segment landing and the sequence being declared done. */
  settle: number
}

/**
 * The reveal is the payoff right after reporting a match, so it is paced to be
 * savoured rather than dispatched: ~2.9 s flat, ~5.9 s across a rank change.
 */
export const MMR_REVEAL_TIMING: MmrBarTiming = {
  entry: 500,
  segment: 1600,
  flash: 450,
  swap: 900,
  settle: 800,
}

/** The recap is a summary of matches already played — briefer on purpose. */
export const MMR_RECAP_TIMING: MmrBarTiming = {
  entry: 350,
  segment: 1200,
  flash: 350,
  swap: 450,
  settle: 350,
}

export interface MmrBarPlaybackHooks {
  onSegmentStart?: (segment: MmrBarSegment, index: number) => void
  /** A non-final segment reached the tier edge — the moment to swap the rank badge. */
  onTierCleared?: (nextIndex: number) => void
  onSettled?: () => void
  onDone?: () => void
}

export interface MmrBarPlayback {
  activeIndex: Ref<number>
  progressed: Ref<boolean>
  completed: Ref<boolean>
  /** True for the frame the bar is jumping back to a new tier's starting edge. */
  resetting: Ref<boolean>
  /**
   * Under reduced motion the sequence fires every beat at once, so the bar has
   * to land on each of them without travelling. Bind it to the bar's `instant`.
   */
  instant: boolean
  finished: Ref<boolean>
  timing: MmrBarTiming
  play: () => void
}

/**
 * Walks a bar through its segments one tier at a time: fill, flash on reaching
 * the tier edge, hand over to whatever animates the tier change, then start the
 * next tier from its own edge. Shared by the single reveal and the recap so both
 * read the same way.
 */
export function useMmrBarPlayback(
  getSegments: () => MmrBarSegment[],
  hooks: MmrBarPlaybackHooks = {},
  timing: MmrBarTiming = MMR_REVEAL_TIMING,
): MmrBarPlayback {
  const activeIndex = ref(0)
  const progressed = ref(false)
  const completed = ref(false)
  const resetting = ref(false)
  const instant = prefersReducedMotion()
  const sequence = useTimedSequence()

  /**
   * Repaints at the new tier's starting edge before travelling, so a promotion
   * visibly restarts from empty instead of sliding out of the tier it just
   * completed.
   *
   * The jump back has to be instant: the bar reuses the same nodes across
   * segments, so leaving the transition on would animate 100 % → 0 % backwards
   * and read as the bar draining. Hence `resetting` — one frame with transitions
   * off to land on the new edge, then a second frame that re-enables them and
   * starts the travel.
   */
  function startSegment(index: number): void {
    const segment = getSegments()[index]
    if (!segment) return
    activeIndex.value = index
    completed.value = false
    hooks.onSegmentStart?.(segment, index)
    if (instant) {
      resetting.value = false
      progressed.value = true
      return
    }
    progressed.value = false
    resetting.value = true
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        resetting.value = false
        progressed.value = true
      }),
    )
  }

  function buildSteps(): SequenceStep[] {
    const crossings = getSegments().flatMap((segment, index): SequenceStep[] => {
      if (segment.isFinal) return []
      return [
        {
          delay: timing.segment,
          run: () => {
            completed.value = true
          },
        },
        { delay: timing.flash, run: () => hooks.onTierCleared?.(index + 1) },
        { delay: timing.swap, run: () => startSegment(index + 1) },
      ]
    })
    return [
      { delay: timing.entry, run: () => startSegment(0) },
      ...crossings,
      { delay: timing.segment, run: () => hooks.onSettled?.() },
      { delay: timing.settle, run: () => hooks.onDone?.() },
    ]
  }

  function play(): void {
    sequence.start(buildSteps())
  }

  return {
    activeIndex,
    progressed,
    completed,
    resetting,
    instant,
    finished: sequence.finished,
    timing,
    play,
  }
}
