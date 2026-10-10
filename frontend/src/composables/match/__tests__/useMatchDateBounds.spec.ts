import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { ClientBaseTournament } from '@skol-arena/shared/types/index'
import { dateRangeIssue, useMatchDateBounds } from '../useMatchDateBounds'

vi.mock('@/composables/config/config.service', () => ({
  useConfigService: () => ({ config: ref({ ranked: { matchMaxAgeHours: 0 } }) }),
}))

/** Tournament days (`2026-09-08`) are revived by the HTTP interceptor as local midnight. */
function tournament(mode: 'championship' | 'ranked'): ClientBaseTournament {
  return {
    mode,
    startDate: new Date(2026, 8, 8),
    endDate: new Date(2026, 11, 7),
  } as unknown as ClientBaseTournament
}

describe('useMatchDateBounds', () => {
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
})

describe('dateRangeIssue', () => {
  const min = new Date(2026, 9, 8, 18, 42, 37)
  const max = new Date(2026, 11, 7, 23, 59, 59, 999)

  it('accepts the floor minute the picker shows as allowed', () => {
    expect(dateRangeIssue(new Date(2026, 9, 8, 18, 42), min, max)).toBeNull()
  })

  it('flags a date before the floor or after the last day', () => {
    expect(dateRangeIssue(new Date(2026, 9, 8, 18, 41), min, max)).toBe('tooEarly')
    expect(dateRangeIssue(new Date(2026, 11, 8, 0, 0), min, max)).toBe('tooLate')
  })

  it('has nothing to say without a date or without bounds', () => {
    expect(dateRangeIssue(null, min, max)).toBeNull()
    expect(dateRangeIssue(new Date(2030, 0, 1), undefined, undefined)).toBeNull()
  })
})
