import { computed, type WritableComputedRef } from 'vue'
import {
  CalendarDate,
  CalendarDateTime,
  getLocalTimeZone,
  type DateValue,
} from '@internationalized/date'

/** Local calendar day of a Date, as the date inputs expect it. */
export function toCalendarDate(date: Date | null | undefined): CalendarDate | undefined {
  if (!date) return undefined
  return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

/**
 * Local midnight of a calendar day: what the former date picker produced.
 * Not `new Date(year, …)`, which reads years 0–99 as 1900–1999: the input emits
 * every keystroke, so a year being typed ("2", "20"…) would round-trip as 1902.
 */
export function fromCalendarDate(value: DateValue | null | undefined): Date | undefined {
  if (!value) return undefined
  return new CalendarDate(value.year, value.month, value.day).toDate(getLocalTimeZone())
}

/** Two-way bridge between a `Date` field and a date input's `v-model`. */
export function useCalendarDateModel(
  get: () => Date | null | undefined,
  set: (value: Date | undefined) => void,
): WritableComputedRef<CalendarDate | undefined> {
  return computed({
    get: () => toCalendarDate(get()),
    set: (value) => set(fromCalendarDate(value)),
  })
}

/** Local date and minute of a Date, for a date input with `granularity="minute"`. */
export function toCalendarDateTime(date: Date | null | undefined): CalendarDateTime | undefined {
  if (!date) return undefined
  return new CalendarDateTime(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
  )
}

/** The local instant a date-time input designates. Same year caveat as `fromCalendarDate`. */
export function fromCalendarDateTime(value: DateValue | null | undefined): Date | undefined {
  if (!value) return undefined
  const hour = 'hour' in value ? value.hour : 0
  const minute = 'minute' in value ? value.minute : 0
  return new CalendarDateTime(value.year, value.month, value.day, hour, minute).toDate(
    getLocalTimeZone(),
  )
}
