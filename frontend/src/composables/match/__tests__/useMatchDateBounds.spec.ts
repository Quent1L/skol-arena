import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import type { ClientBaseTournament } from '@skol-arena/shared/types/index'
import { dateRangeIssue, useMatchDateBounds } from '../useMatchDateBounds'

const matchMaxAgeHours = ref(0)

vi.mock('@/composables/config/config.service', async () => {
  const { computed } = await import('vue')
  return {
    useConfigService: () => ({
      config: computed(() => ({ ranked: { matchMaxAgeHours: matchMaxAgeHours.value } })),
    }),
  }
})

/** Tournament days (`2026-09-08`) are revived by the HTTP interceptor as local midnight. */
function tournament(mode: 'championship' | 'ranked'): ClientBaseTournament {
  return {
    mode,
    startDate: new Date(2026, 8, 8),
    endDate: new Date(2026, 11, 7),
  } as unknown as ClientBaseTournament
}

describe('useMatchDateBounds', () => {
  afterEach(() => {
    matchMaxAgeHours.value = 0
    vi.useRealTimers()
  })

  it('accepts a match late on the last day, in local time', () => {
    const { maxDate } = useMatchDateBounds(ref(tournament('championship')))
    expect(maxDate.value).toEqual(new Date(2026, 11, 7, 23, 59, 59, 999))
    expect(new Date(2026, 11, 7, 18, 0).getTime()).toBeLessThan(maxDate.value!.getTime())
  })

  it('applies the same days to a ranked season without a reporting window', () => {
    const { minDate, maxDate } = useMatchDateBounds(ref(tournament('ranked')))
    expect(minDate.value).toEqual(new Date(2026, 8, 8))
    expect(maxDate.value).toEqual(new Date(2026, 11, 7, 23, 59, 59, 999))
  })

  it('starts the reporting window at the next whole minute', () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 10, 18, 42, 37) })
    matchMaxAgeHours.value = 48
    const { minDate } = useMatchDateBounds(ref(tournament('ranked')))
    // 18:42 is already 48h and some seconds old: the server would refuse it.
    expect(minDate.value).toEqual(new Date(2026, 9, 8, 18, 43))
  })

  it('moves the floor forward while the form stays open', async () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 10, 18, 42, 37) })
    matchMaxAgeHours.value = 48
    const scope = effectScope()
    const { minDate } = scope.run(() => useMatchDateBounds(ref(tournament('ranked'))))!

    vi.advanceTimersByTime(5 * 60 * 1000)
    await nextTick()

    expect(minDate.value).toEqual(new Date(2026, 9, 8, 18, 48))
    scope.stop()
  })
})

describe('dateRangeIssue', () => {
  const min = new Date(2026, 9, 8, 18, 43)
  const max = new Date(2026, 11, 7, 23, 59, 59, 999)

  it('accepts the floor minute itself', () => {
    expect(dateRangeIssue(new Date(2026, 9, 8, 18, 43), min, max)).toBeNull()
  })

  it('flags a date before the floor or after the last day', () => {
    expect(dateRangeIssue(new Date(2026, 9, 8, 18, 42), min, max)).toBe('tooEarly')
    expect(dateRangeIssue(new Date(2026, 11, 8, 0, 0), min, max)).toBe('tooLate')
  })

  it('has nothing to say without a date or without bounds', () => {
    expect(dateRangeIssue(null, min, max)).toBeNull()
    expect(dateRangeIssue(new Date(2030, 0, 1), undefined, undefined)).toBeNull()
  })
})
