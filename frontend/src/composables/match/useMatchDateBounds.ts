import { computed, type Ref } from 'vue'
import { useNow } from '@vueuse/core'
import type { ClientBaseTournament } from '@skol-arena/shared/types/index'
import { useConfigService } from '@/composables/config/config.service'

/** Server default, used until GET /config has landed. Mirrors backend/src/config/ranked.ts. */
const FALLBACK_MATCH_MAX_AGE_HOURS = 48

/** How often the ranked floor moves forward while the form stays open. */
const FLOOR_REFRESH_MS = 30 * 1000
const MINUTE_MS = 60 * 1000

/**
 * A tournament's start and end dates are calendar days (`2026-12-07`), which the HTTP
 * interceptor revives as local midnight. The season closes at the end of its last day
 * (`closeInstant` server-side), so the picker must accept the whole of that day: taken
 * as is, the end date would turn every time on the last day red.
 */
function endOfDay(day: Date): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999)
}

export type DateRangeIssue = 'tooEarly' | 'tooLate' | null

/**
 * The picker works to the minute, so a reporting window opening at 18:42:37 starts at
 * 18:43 for it: 18:42 would already be older than the window the server checks.
 */
function ceilToMinute(date: Date): Date {
  return new Date(Math.ceil(date.getTime() / MINUTE_MS) * MINUTE_MS)
}

/** Whether a match date falls outside the picker's range. */
export function dateRangeIssue(
  date: Date | null | undefined,
  min: Date | null | undefined,
  max: Date | null | undefined,
): DateRangeIssue {
  if (!date) return null
  if (min && date < min) return 'tooEarly'
  if (max && date > max) return 'tooLate'
  return null
}

/**
 * Date range the match form's picker accepts.
 *
 * A ranked match can only be reported for a limited time after it was played, so the
 * floor is the later of the season start and that window. The window itself is a
 * server setting (`RANKED_MATCH_MAX_AGE_HOURS`) served by GET /config — `0` means the
 * server enforces no limit, and the picker then opens back to the season start.
 *
 * The window slides with the clock, so the floor follows `now` rather than the moment
 * the form opened: a form left open would otherwise keep accepting dates the server
 * has since stopped taking.
 *
 * This is a UI convenience only: `WhenStep` enables `manualInput`, so the real
 * enforcement stays server-side.
 */
export function useMatchDateBounds(tournament: Ref<ClientBaseTournament | null>) {
  const { config } = useConfigService()
  const now = useNow({ interval: FLOOR_REFRESH_MS })

  const rankedMaxAgeHours = computed(
    () => config.value?.ranked.matchMaxAgeHours ?? FALLBACK_MATCH_MAX_AGE_HOURS,
  )

  const minDate = computed<Date | undefined>(() => {
    const startDate = tournament.value?.startDate ?? undefined
    if (tournament.value?.mode !== 'ranked') return startDate

    if (rankedMaxAgeHours.value === 0) return startDate

    const windowStart = ceilToMinute(
      new Date(now.value.getTime() - rankedMaxAgeHours.value * 60 * MINUTE_MS),
    )
    return startDate && startDate > windowStart ? startDate : windowStart
  })

  const maxDate = computed<Date | undefined>(() => {
    const day = tournament.value?.endDate
    return day ? endOfDay(day) : undefined
  })

  return { minDate, maxDate }
}
