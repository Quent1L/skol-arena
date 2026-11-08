import { format } from 'date-fns'
import { i18n } from '@/i18n'

const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?([+-]\d{2}:?\d{2}|Z)$/
const localDateRegex = /^\d{4}-\d{2}-\d{2}$/
const arrayOfDateStringRegex = [isoDateRegex, localDateRegex]

export function isDateString(str: string) {
  return arrayOfDateStringRegex.some((regex) => regex.test(str))
}
/**
 * Function that converts string-formatted dates into javascript dates
 * @param data  data to convert
 * @returns converted data
 */
function parseDateString(value: string): Date {
  const localMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (localMatch) {
    return new Date(+localMatch[1], +localMatch[2] - 1, +localMatch[3])
  }
  return new Date(value)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertDateValue(value: any): any {
  if (typeof value === 'string' && isDateString(value)) {
    return parseDateString(value)
  }
  if (typeof value === 'object' && value !== null) {
    return convertDatesDeep(value)
  }
  return value
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertDatesDeep(data: any): any {
  if (Array.isArray(data)) {
    return data.map((item) => convertDatesDeep(item))
  }
  if (typeof data === 'object' && data !== null) {
    for (const key in data) {
      if (Object.hasOwn(data, key)) {
        data[key] = convertDateValue(data[key])
      }
    }
  }
  return data
}

export function convertStringDatesToJS<T>(data: T): T {
  return convertDatesDeep(data) as T
}

export function dateToStringDDMMYYYY(date: Date | undefined | null) {
  if (!date) return date
  return format(date, 'dd/MM/yyyy')
}
export function dateToStringDDMMYYYYHHMMSS(date: Date | undefined) {
  if (!date) return date
  return format(date, 'dd/MM/yyyy HH:mm:ss')
}
export function dateToStringDDMMYYYYHHMM(date: Date | undefined) {
  if (!date) return date
  return format(date, 'dd/MM/yyyy HH:mm')
}

export function formatDate(dateString: string | Date): string {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString
  return format(date, 'dd/MM/yyyy')
}

function formatDaysDuration(diffDays: number): string {
  return i18n.global.t('dateUtils.day', diffDays)
}

function formatWeeksDuration(diffDays: number): string {
  const weeks = Math.floor(diffDays / 7)
  const remainingDays = diffDays % 7
  if (remainingDays === 0) {
    return i18n.global.t('dateUtils.week', weeks)
  }
  const weekLabel = i18n.global.t('dateUtils.week', weeks)
  const dayLabel = i18n.global.t('dateUtils.day', remainingDays)
  return i18n.global.t('dateUtils.weekAndDays', { weeks: weekLabel, days: dayLabel })
}

function formatMonthsDuration(diffDays: number): string {
  const months = Math.floor(diffDays / 30)
  return i18n.global.t('dateUtils.month', months)
}

export function calculateDuration(startDate: string | Date, endDate: string | Date): string {
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate

  const diffTime = Math.abs(end.getTime() - start.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays < 7) return formatDaysDuration(diffDays)
  if (diffDays < 30) return formatWeeksDuration(diffDays)
  return formatMonthsDuration(diffDays)
}
