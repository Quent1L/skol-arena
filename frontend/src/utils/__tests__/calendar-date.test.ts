import { describe, it, expect } from 'vitest'
import { CalendarDate } from '@internationalized/date'
import { fromCalendarDate, toCalendarDate } from '@/utils/calendar-date'

describe('calendar-date', () => {
  it('keeps the local calendar day both ways', () => {
    const date = new Date(2026, 9, 8, 23, 30)
    const day = toCalendarDate(date)!

    expect(day.toString()).toBe('2026-10-08')
    expect(fromCalendarDate(day)).toEqual(new Date(2026, 9, 8))
  })

  it('maps an empty value to undefined', () => {
    expect(toCalendarDate(null)).toBeUndefined()
    expect(fromCalendarDate(undefined)).toBeUndefined()
  })

  it('keeps a partially typed year instead of reading it as 19xx', () => {
    const date = fromCalendarDate(new CalendarDate(2, 10, 1))!

    expect(date.getFullYear()).toBe(2)
    expect(toCalendarDate(date)!.year).toBe(2)
  })

  it('reads a month as 1-based', () => {
    expect(fromCalendarDate(new CalendarDate(2026, 1, 31))).toEqual(new Date(2026, 0, 31))
  })
})
