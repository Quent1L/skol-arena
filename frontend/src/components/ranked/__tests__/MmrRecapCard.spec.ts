import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import type { ClientRankTier, MmrAnimationEventResponse } from '@skol-arena/shared'
import { makeMmrEvent, makeTier } from '@/test-support/factories'
import MmrRecapCard from '../MmrRecapCard.vue'

// t echoes the key, appending #count when an interpolation count is given, so we
// can assert both the chosen i18n key and its plural/singular count.
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: { count?: number }) =>
      params?.count !== undefined ? `${key}#${params.count}` : key,
  }),
}))

const ev = makeMmrEvent

const TIERS = [
  makeTier({ level: 1, name: 'Bronze', minMmr: 700 }),
  makeTier({ level: 2, name: 'Silver', minMmr: 900 }),
]

function mountCard(events: MmrAnimationEventResponse[], tiers?: ClientRankTier[]) {
  return mount(MmrRecapCard, {
    props: tiers ? { events, tiers } : { events },
    global: { stubs: { PlayerAvatarStack: true } },
  })
}

// MmrRecapCard teleports to <body>; query there and reset between tests.
const netEl = () => document.body.querySelector('.text-4xl')?.textContent?.trim()
const summaryEl = () => document.body.querySelector('.text-gray-400')?.textContent?.trim()
const rowDeltas = () =>
  [...document.body.querySelectorAll('.divide-y .font-mono')].map((n) => n.textContent?.trim())
const toggleBtn = () =>
  [...document.body.querySelectorAll('button')].find((b) =>
    b.textContent?.includes('mmrRecapCard.showDetail') || b.textContent?.includes('mmrRecapCard.hideDetail'),
  )

/** The recap is not skippable, so tests let its sequence run out. */
const runToEnd = async () => {
  vi.advanceTimersByTime(20_000)
  await nextTick()
  await nextTick()
}

beforeEach(() => vi.useFakeTimers())

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('MmrRecapCard', () => {
  it('net total = sum of displayDelta (falls back to mmrDelta when null)', () => {
    mountCard([
      ev({ reason: 'recalculated', mmrDelta: 18, displayDelta: 3 }),
      ev({ reason: 'recalculated', mmrDelta: -5, displayDelta: -1 }),
      ev({ reason: 'match_finalized', mmrDelta: 4, displayDelta: null as unknown as number }), // legacy row
    ])
    expect(netEl()).toBe('+6') // 3 - 1 + 4
  })

  it('negative net: no + sign', () => {
    mountCard([ev({ reason: 'recalculated', mmrDelta: -20, displayDelta: -8 })])
    expect(netEl()).toBe('-8')
  })

  it('each row shows displayDelta, not the full delta', () => {
    mountCard([
      ev({ reason: 'recalculated', mmrDelta: 18, displayDelta: 3 }),
      ev({ reason: 'recalculated', mmrDelta: -5, displayDelta: -1 }),
    ])
    expect(rowDeltas()).toEqual(['+3', '-1'])
  })

  it("badges: 'recalculated' (fa-rotate) and 'cancelled' (fa-ban) depending on the reason", () => {
    mountCard([
      ev({ reason: 'recalculated', displayDelta: 2 }),
      ev({ reason: 'match_cancelled', displayDelta: -12 }),
      ev({ reason: 'cascade', displayDelta: -3 }),
    ])
    expect(document.body.querySelectorAll('.fa-rotate').length).toBe(1)
    expect(document.body.querySelectorAll('.fa-ban').length).toBe(2) // match_cancelled + cascade
  })

  it('summary: one fragment per non-empty category, badge and summary agree', () => {
    mountCard([
      ev({ reason: 'match_finalized', displayDelta: 10 }),
      ev({ reason: 'match_finalized', displayDelta: 5 }),
      ev({ reason: 'recalculated', displayDelta: 1 }),
      ev({ reason: 'match_cancelled', displayDelta: -4 }),
    ])
    expect(summaryEl()).toBe(
      'mmrRecapCard.newMatchesPlural#2, mmrRecapCard.recalcMatchesSingular#1, mmrRecapCard.cancelledMatchesSingular#1',
    )
  })

  it('summary: recalculated matches alone', () => {
    mountCard([
      ev({ reason: 'recalculated', displayDelta: 1 }),
      ev({ reason: 'recalculated', displayDelta: 2 }),
    ])
    expect(summaryEl()).toBe('mmrRecapCard.recalcMatchesPlural#2')
  })

  it('detail expanded as long as the list stays readable, no collapse button', () => {
    mountCard([ev({ displayDelta: 1 }), ev({ displayDelta: 2 }), ev({ displayDelta: 3 })])
    expect(rowDeltas()).toEqual(['+1', '+2', '+3'])
    expect(toggleBtn()).toBeUndefined()
  })

  it('beyond 3 matches, the detail is collapsed behind a button', async () => {
    mountCard([1, 2, 3, 4].map((n) => ev({ displayDelta: n })))
    expect(rowDeltas()).toEqual([])

    const toggle = toggleBtn()
    expect(toggle?.textContent).toContain('mmrRecapCard.showDetail#4')

    toggle!.click()
    await nextTick()
    expect(rowDeltas()).toEqual(['+1', '+2', '+3', '+4'])
    expect(toggleBtn()?.textContent).toContain('mmrRecapCard.hideDetail')
  })

  it('with no tier table, no progress bar', () => {
    mountCard([ev({ mmrBefore: 1000, mmrAfter: 1020, displayDelta: 20 })])
    expect(document.body.querySelector('.track')).toBeNull()
  })

  it('with tiers, the bar starts at the first event and ends at the last', async () => {
    mountCard(
      [
        ev({ mmrBefore: 1000, mmrAfter: 1020, displayDelta: 20 }),
        ev({ mmrBefore: 1020, mmrAfter: 1060, displayDelta: 40 }),
      ],
      TIERS,
    )
    expect(document.body.querySelector('.track')).not.toBeNull()
    expect(document.body.textContent).toContain('mmrRecapCard.progression')
    expect(document.body.textContent).toContain('1000 → 1000')
    // Here the tier isn't shown anywhere else: the bar has to name it.
    expect(document.body.querySelector('.bar-labels')?.textContent).toContain('Silver')

    await runToEnd()
    expect(document.body.textContent).toContain('1000 → 1060')
  })

  it('a corrected result gets its own badge and its own count in the summary', () => {
    mountCard([
      ev({ reason: 'match_corrected', mmrDelta: -12, displayDelta: -27 }),
      ev({ reason: 'recalculated', mmrDelta: 8, displayDelta: 2 }),
    ])

    expect(document.body.textContent).toContain('mmrRecapCard.corrected')
    expect(summaryEl()).toBe(
      'mmrRecapCard.recalcMatchesSingular#1, mmrRecapCard.correctedMatchesSingular#1',
    )
    expect(netEl()).toBe('-25')
  })

  it('recalculation: the bar follows the announced differential, not the rewritten chain', async () => {
    // A recalculation rewrites mmrBefore/mmrAfter on matches already seen: starting from
    // events[0].mmrBefore would draw a long climb under a negative title.
    mountCard(
      [
        ev({ reason: 'recalculated', mmrBefore: 1000, mmrAfter: 1030, mmrDelta: 30, displayDelta: -5 }),
        ev({ reason: 'recalculated', mmrBefore: 1030, mmrAfter: 1050, mmrDelta: 20, displayDelta: -7 }),
      ],
      TIERS,
    )

    expect(netEl()).toBe('-12')
    // Start = current MMR minus the announced points, so a bar that goes down.
    expect(document.body.textContent).toContain('1062 → 1062')
    await runToEnd()
    expect(document.body.textContent).toContain('1062 → 1050')
  })
})
