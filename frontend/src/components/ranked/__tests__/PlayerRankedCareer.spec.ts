import { describe, it, expect, vi } from 'vitest'
import { RouterLinkStub } from '@vue/test-utils'
import { mountWithPlugins } from '@/test-support/mount'
import { makeCareerSeason, makeTier } from '@/test-support/factories'
import type { PlayerCareerSeason } from '@skol-arena/shared'
import PlayerRankedCareer from '../PlayerRankedCareer.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
  createI18n: () => ({ global: { t: (key: string) => key }, install: () => {} }),
}))

const babyfoot = { id: 'disc-1', name: 'Babyfoot', icon: 'fa fa-futbol' }
const pingpong = { id: 'disc-2', name: 'Ping-pong', icon: 'fa fa-table-tennis' }

function mountCareer(seasons: PlayerCareerSeason[], loading = false) {
  return mountWithPlugins(PlayerRankedCareer, {
    props: { seasons, loading },
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
}

/** The card opens compact; the per-season breakdown is behind the details toggle. */
async function mountDetailed(seasons: PlayerCareerSeason[]) {
  const wrapper = mountCareer(seasons)
  await wrapper.find('[data-test="career-detail-toggle"]').trigger('click')
  return wrapper
}

const strip = (text: string) => text.replace(/ | |\s/g, '')

describe('PlayerRankedCareer', () => {
  it('shows an empty state when the player has no ranked history', () => {
    const wrapper = mountCareer([])

    expect(wrapper.find('[data-test="ranked-career-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="ranked-career"]').exists()).toBe(false)
  })

  it('shows a spinner instead of the list while loading', () => {
    const wrapper = mountCareer([makeCareerSeason({ discipline: babyfoot })], true)

    expect(wrapper.find('[data-test="ranked-career"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="ranked-career-empty"]').exists()).toBe(false)
  })

  it('groups the seasons by discipline', () => {
    const wrapper = mountCareer([
      makeCareerSeason({ discipline: babyfoot }),
      makeCareerSeason({ discipline: pingpong }),
    ])

    expect(wrapper.text()).toContain('Babyfoot')
    expect(wrapper.text()).toContain('Ping-pong')
  })

  it('names a deleted discipline rather than dropping its seasons', () => {
    const wrapper = mountCareer([makeCareerSeason({ discipline: null })])

    expect(wrapper.findAll('[data-test="career-chip"]')).toHaveLength(1)
    expect(wrapper.text()).toContain('playerRankedCareer.noDiscipline')
  })
})

// Compact is the default: a season history is a summary until asked otherwise, and
// chips let several seasons share a line instead of one card each.
describe('PlayerRankedCareer compact view', () => {
  const seasons = () => [
    makeCareerSeason({ seasonName: 'S1', peakMmr: 1450, avgMmr: 1300, discipline: babyfoot }),
    makeCareerSeason({ seasonName: 'S2', peakMmr: 1200, avgMmr: 1100, discipline: babyfoot }),
  ]

  it('opens on the chips, not on the full breakdown', () => {
    const wrapper = mountCareer(seasons())

    expect(wrapper.findAll('[data-test="career-chip"]')).toHaveLength(2)
    expect(wrapper.findAll('[data-test="career-season"]')).toHaveLength(0)
  })

  it('carries the peak and the season name, and nothing else', () => {
    const text = strip(mountCareer(seasons()).find('[data-test="career-chip"]').text())

    expect(text).toContain('1450')
    expect(text).toContain('S1')
    // the average belongs to the detailed view
    expect(text).not.toContain('1300')
  })

  it('reads the peak against the ladder of its own season', () => {
    // 1450 is top tier on this season's ladder; on a later one it would not be
    const wrapper = mountCareer([
      makeCareerSeason({
        peakMmr: 1450,
        discipline: babyfoot,
        tiers: [
          makeTier({ level: 1, minMmr: 700, name: 'Bronze' }),
          makeTier({ level: 2, minMmr: 1400, name: 'Légende' }),
        ],
      }),
    ])

    expect(wrapper.find('[data-test="career-chip"] i').attributes('title')).toBe('Légende')
  })

  it('marks the discipline record, and only that one', () => {
    const wrapper = mountCareer(seasons())

    expect(wrapper.findAll('[data-test="career-record"]')).toHaveLength(1)
    const marked = wrapper
      .findAll('[data-test="career-chip"]')
      .find((chip) => chip.find('[data-test="career-record"]').exists())
    expect(marked?.text()).toContain('S1')
  })

  it('marks one record per discipline', () => {
    const wrapper = mountCareer([
      makeCareerSeason({ peakMmr: 1450, discipline: babyfoot }),
      makeCareerSeason({ peakMmr: 1200, discipline: babyfoot }),
      makeCareerSeason({ peakMmr: 1100, discipline: pingpong }),
    ])

    expect(wrapper.findAll('[data-test="career-record"]')).toHaveLength(2)
  })
})

describe('PlayerRankedCareer detailed view', () => {
  const seasons = () => [
    makeCareerSeason({ seasonName: 'S1', peakMmr: 1450, discipline: babyfoot }),
    makeCareerSeason({ seasonName: 'S2', peakMmr: 1200, discipline: babyfoot }),
  ]

  it('swaps the chips for one card per season', async () => {
    const wrapper = await mountDetailed(seasons())

    expect(wrapper.findAll('[data-test="career-season"]')).toHaveLength(2)
    expect(wrapper.findAll('[data-test="career-chip"]')).toHaveLength(0)
  })

  it('folds back to the chips', async () => {
    const wrapper = await mountDetailed(seasons())
    await wrapper.find('[data-test="career-detail-toggle"]').trigger('click')

    expect(wrapper.findAll('[data-test="career-chip"]')).toHaveLength(2)
  })

  it('reports its state to assistive tech', async () => {
    const wrapper = mountCareer(seasons())
    const toggle = wrapper.find('[data-test="career-detail-toggle"]')

    expect(toggle.attributes('aria-expanded')).toBe('false')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
  })

  it('shows the peak, average and final MMR of each season', async () => {
    const wrapper = await mountDetailed([
      makeCareerSeason({ peakMmr: 1450, avgMmr: 1210, finalMmr: 1330, discipline: babyfoot }),
    ])

    const text = strip(wrapper.find('[data-test="career-season"]').text())
    for (const value of ['1450', '1210', '1330']) expect(text).toContain(value)
  })

  it('reads each figure against the ladder of its own season', async () => {
    // Same MMR, two ladders: the old season's peak is Légende, the new one's Bronze.
    const wrapper = await mountDetailed([
      makeCareerSeason({
        seasonId: 'old',
        peakMmr: 1450,
        avgMmr: 1450,
        finalMmr: 1450,
        endDate: new Date('2025-06-30'),
        discipline: babyfoot,
        tiers: [
          makeTier({ seasonId: 'old', level: 1, minMmr: 700, name: 'Bronze' }),
          makeTier({ seasonId: 'old', level: 2, minMmr: 1400, name: 'Légende' }),
        ],
      }),
      makeCareerSeason({
        seasonId: 'now',
        peakMmr: 1450,
        avgMmr: 1450,
        finalMmr: 1450,
        endDate: new Date('2026-06-30'),
        discipline: babyfoot,
        tiers: [
          makeTier({ seasonId: 'now', level: 1, minMmr: 700, name: 'Bronze' }),
          makeTier({ seasonId: 'now', level: 2, minMmr: 1800, name: 'Légende' }),
        ],
      }),
    ])

    const cards = wrapper.findAll('[data-test="career-season"]')
    const titles = (idx: number) =>
      cards[idx].findAll('.grid i[title]').map((icon) => icon.attributes('title'))

    // Newest first: the current season reads Bronze, the old one Légende.
    expect(titles(0)).toEqual(['Bronze', 'Bronze', 'Bronze'])
    expect(titles(1)).toEqual(['Légende', 'Légende', 'Légende'])
  })

  it('flags a season with incomplete placements', async () => {
    const wrapper = await mountDetailed([
      makeCareerSeason({ placementsComplete: false, discipline: babyfoot }),
      makeCareerSeason({ placementsComplete: true, discipline: babyfoot }),
    ])

    expect(wrapper.findAll('[data-test="career-provisional"]')).toHaveLength(1)
  })

  it('marks the record with a border, not a ring', async () => {
    // A ring is a box-shadow painted outside the box: any ancestor that clips its
    // overflow cuts it off. Every card carries a transparent border so the
    // highlight costs no layout shift.
    const wrapper = await mountDetailed(seasons())
    const cards = wrapper.findAll('[data-test="career-season"]')
    const record = cards.find((c) => c.find('[data-test="career-record"]').exists())!
    const plain = cards.find((c) => !c.find('[data-test="career-record"]').exists())!

    expect(record.classes()).toContain('border-amber-400/40')
    expect(record.classes()).not.toContain('ring-1')
    expect(plain.classes()).toContain('border-transparent')
  })
})

// The generic per-discipline block skips the seasons this card covers, so the totals
// it used to show have to survive here — otherwise unifying loses information.
describe('PlayerRankedCareer discipline totals', () => {
  const seasons = () => [
    makeCareerSeason({
      discipline: babyfoot,
      matchesPlayed: 55,
      wins: 43,
      losses: 12,
      draws: 0,
    }),
    makeCareerSeason({
      discipline: babyfoot,
      matchesPlayed: 1,
      wins: 1,
      losses: 0,
      draws: 0,
    }),
  ]

  it('sums the matches over the discipline', () => {
    const totals = mountCareer(seasons()).find('[data-test="career-totals"]').text()

    expect(strip(totals)).toContain('56')
  })

  it('sums wins and losses', () => {
    const totals = strip(mountCareer(seasons()).find('[data-test="career-totals"]').text())

    expect(totals).toContain(`44${'playerRankedCareer.winsShort'}`)
    expect(totals).toContain(`12${'playerRankedCareer.lossesShort'}`)
  })

  it('derives the win rate from them', () => {
    // 44 of 56
    const totals = strip(mountCareer(seasons()).find('[data-test="career-totals"]').text())

    expect(totals).toContain('79%')
  })

  it('counts each discipline on its own', () => {
    const wrapper = mountCareer([
      makeCareerSeason({ discipline: babyfoot, matchesPlayed: 10, wins: 5, losses: 5 }),
      makeCareerSeason({ discipline: pingpong, matchesPlayed: 4, wins: 4, losses: 0 }),
    ])
    const totals = wrapper.findAll('[data-test="career-totals"]')

    expect(totals).toHaveLength(2)
    expect(strip(totals[0].text())).toContain('50%')
    expect(strip(totals[1].text())).toContain('100%')
  })

  it('does not divide by zero on a season with no rated match', () => {
    const wrapper = mountCareer([
      makeCareerSeason({ discipline: babyfoot, matchesPlayed: 0, wins: 0, losses: 0, draws: 0 }),
    ])

    expect(strip(wrapper.find('[data-test="career-totals"]').text())).toContain('0%')
  })

  it('opens the season it names', () => {
    const wrapper = mountCareer([makeCareerSeason({ seasonId: 's1', discipline: babyfoot })])
    const chip = wrapper.findComponent(RouterLinkStub)

    expect(chip.props('to')).toBe('/tournaments/s1')
  })
})
