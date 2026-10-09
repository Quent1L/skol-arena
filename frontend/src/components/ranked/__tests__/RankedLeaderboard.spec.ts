import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RouterLinkStub } from '@vue/test-utils'
import { mountWithPlugins } from '@/test-support/mount'
import { makeTier, makePlayerMmr } from '@/test-support/factories'
import RankedLeaderboard from '../RankedLeaderboard.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
  createI18n: () => ({ global: { t: (key: string) => key }, install: () => {} }),
}))

// jsdom reports a 0x0 screen, which `useViewport` reads as mobile: the form factor is
// pinned here instead, so each test states which switcher it exercises.
const viewport = vi.hoisted(() => ({ mobile: false }))
vi.mock('@/composables/useViewport', async () => {
  const { ref } = await import('vue')
  return { useViewport: () => ({ isMobile: ref(viewport.mobile), width: ref(1024) }) }
})

const tiers = [
  makeTier({ id: 'bronze', level: 1, name: 'Bronze', minMmr: 700 }),
  makeTier({ id: 'gold', level: 2, name: 'Gold', minMmr: 1100 }),
]

const players = [
  makePlayerMmr({
    currentMmr: 1450,
    player: { id: 'u1', displayName: 'Alice', shortName: 'AL' },
  }),
  makePlayerMmr({
    currentMmr: 1000,
    player: { id: 'u2', displayName: 'Bob', shortName: 'BO' },
  }),
]

// Unless a test says otherwise the switcher under test is the desktop sidebar.
function modeLabels(wrapper: ReturnType<typeof mountBoard>): string[] {
  return wrapper.findAll('[data-test^="subtab-"]').map((button) => button.text())
}

async function selectMode(wrapper: ReturnType<typeof mountBoard>, mode: string) {
  await wrapper.find(`[data-test="subtab-${mode.toLowerCase()}"]`).trigger('click')
}

function mountBoard(props: Record<string, unknown> = {}) {
  // showModeToggle is an optional Boolean prop: absent, Vue casts it to false
  return mountWithPlugins(RankedLeaderboard, {
    props: { players, tiers, showModeToggle: true, ...props },
  })
}

describe('RankedLeaderboard', () => {
  it('no tiers: dedicated message', () => {
    const wrapper = mountBoard({ tiers: [] })
    expect(wrapper.text()).toContain('rankedLeaderboard.noTiers')
  })

  it('groups players under the right tier, tiers from highest to lowest', () => {
    const wrapper = mountBoard()
    const text = wrapper.text()
    // Gold first (sorted desc), Alice (1450) in it; Bob (1000) in Bronze
    expect(text.indexOf('Gold')).toBeLessThan(text.indexOf('Bronze'))
    expect(text.indexOf('Gold')).toBeLessThan(text.indexOf('Alice'))
    expect(text.indexOf('Bronze')).toBeLessThan(text.indexOf('Bob'))
    expect(text.indexOf('Alice')).toBeLessThan(text.indexOf('Bronze'))
  })

  it('provisional toggle: emits load-provisional only once', async () => {
    const wrapper = mountBoard()
    await selectMode(wrapper, 'Provisional')
    await selectMode(wrapper, 'Official')
    await selectMode(wrapper, 'Provisional')
    expect(wrapper.emitted('load-provisional')).toHaveLength(1)
  })

  it('the active view is the only one marked selected in the navigation', async () => {
    const wrapper = mountBoard()
    const selected = () =>
      wrapper
        .findAll('[data-test^="subtab-"]')
        .filter((button) => button.attributes('aria-selected') === 'true')
        .map((button) => button.text())

    expect(selected()).toEqual(['rankedLeaderboard.modeOfficial'])

    await selectMode(wrapper, 'Provisional')

    expect(selected()).toEqual(['rankedLeaderboard.modeProvisional'])
  })

  it('first load: full-screen spinner', () => {
    const wrapper = mountBoard({ players: [], loading: true })
    expect(wrapper.find('[data-testid="leaderboard-spinner"]').exists()).toBe(true)
  })

  it('refresh with data: discreet banner, list kept', () => {
    const wrapper = mountBoard({ loading: true })
    expect(wrapper.find('[data-testid="leaderboard-spinner"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('rankedLeaderboard.refreshing')
    expect(wrapper.text()).toContain('Alice')
  })

  it('recalculation in progress: dedicated banner', () => {
    const wrapper = mountBoard({ isRecalculating: true })
    expect(wrapper.text()).toContain('rankedLeaderboard.recalculating')
  })

  it('current player row is highlighted', () => {
    const wrapper = mountBoard({ currentUserId: 'u1' })
    const rows = wrapper.findAllComponents(RouterLinkStub)
    const aliceRow = rows.find((r) => r.text().includes('Alice'))
    expect(aliceRow!.classes()).toContain('bg-primary-900/30')
    expect(aliceRow!.text()).toContain('rankedLeaderboard.you')
  })

  // A single view: no navigation at all, just the standings.
  it('hiding the toggle via showModeToggle', () => {
    const wrapper = mountBoard({ showModeToggle: false })
    expect(modeLabels(wrapper)).toEqual([])
    expect(wrapper.text()).toContain('Alice')
  })

  // Peak and average only make sense once the season is finished.
  describe('season standings', () => {
    const seasonMmrPlayers = [
      makePlayerMmr({
        currentMmr: 1000,
        player: { id: 'u1', displayName: 'Alice', shortName: 'AL' },
      }),
      makePlayerMmr({
        currentMmr: 1450,
        player: { id: 'u2', displayName: 'Bob', shortName: 'BO' },
      }),
    ].map((p, i) =>
      i === 0 ? { ...p, peakMmr: 1450, avgMmr: 1200 } : { ...p, peakMmr: 1150, avgMmr: 1300 },
    )

    function mountFinished(props: Record<string, unknown> = {}) {
      return mountBoard({ showSeasonStats: true, seasonMmrPlayers, ...props })
    }

    it('ongoing season: no peak/average modes', () => {
      expect(modeLabels(mountBoard())).toEqual([
        'rankedLeaderboard.modeOfficial',
        'rankedLeaderboard.modeProvisional',
      ])
    })

    // Nothing is left to settle once the season is closed: provisional would just
    // repeat the official standings.
    it('finished season: official, peak and average, no provisional', () => {
      expect(modeLabels(mountFinished())).toEqual([
        'rankedLeaderboard.modeOfficial',
        'rankedLeaderboard.modePeak',
        'rankedLeaderboard.modeAverage',
      ])
    })

    it('toggle is visible even when provisional is disabled on the tournament', () => {
      expect(modeLabels(mountFinished({ showModeToggle: false }))).toHaveLength(3)
    })

    it('emits load-season-stats only once for both views', async () => {
      const wrapper = mountFinished()
      await selectMode(wrapper, 'Peak')
      await selectMode(wrapper, 'Average')
      await selectMode(wrapper, 'Peak')
      expect(wrapper.emitted('load-season-stats')).toHaveLength(1)
    })

    it('peak mode: groups and sorts by peak, not current MMR', async () => {
      const wrapper = mountFinished()
      await selectMode(wrapper, 'Peak')
      const text = wrapper.text()
      // Alice (peak 1450) moves to Gold ahead of Bob (peak 1150, also Gold but lower)
      expect(text.indexOf('Alice')).toBeLessThan(text.indexOf('Bob'))
      expect(text).toContain('1450')
      expect(text).not.toContain('1000')
    })

    it('average mode: sorts by avgMmr', async () => {
      const wrapper = mountFinished()
      await selectMode(wrapper, 'Average')
      const text = wrapper.text()
      // Bob (1300) ahead of Alice (1200)
      expect(text.indexOf('Bob')).toBeLessThan(text.indexOf('Alice'))
      expect(text).toContain('1300')
    })

    it('season mode: current streak hidden', async () => {
      const onStreak = { ...seasonMmrPlayers[0], winStreak: 4 }
      const wrapper = mountFinished({ players: [onStreak], seasonMmrPlayers: [onStreak] })
      expect(wrapper.text()).toContain('🔥')
      await selectMode(wrapper, 'Peak')
      expect(wrapper.text()).not.toContain('🔥')
    })
  })

  // A player in placement has no settled MMR: they're listed separately, without rank
  // or MMR, and don't count toward the ranking of others.
  describe('players in placement', () => {
    const inPlacement = makePlayerMmr({
      currentMmr: 1450,
      matchesPlayed: 2,
      recentResults: [],
      player: { id: 'u3', displayName: 'Charlie', shortName: 'CH' },
    })

    function mountWithPlacement(props: Record<string, unknown> = {}) {
      return mountBoard({ players: [...players, inPlacement], placementMatches: 5, ...props })
    }

    it('sorts them out of the tiers and lists them in a dedicated section at the bottom', () => {
      const wrapper = mountWithPlacement()
      const text = wrapper.text()
      expect(text).toContain('rankedLeaderboard.placementSection')
      expect(text.indexOf('Gold')).toBeLessThan(text.indexOf('rankedLeaderboard.placementSection'))
      expect(text.indexOf('rankedLeaderboard.placementSection')).toBeLessThan(
        text.indexOf('Charlie'),
      )
    })

    it("never shows their MMR, only their progress", () => {
      const wrapper = mountWithPlacement()
      const row = wrapper
        .findAllComponents(RouterLinkStub)
        .find((r) => r.text().includes('Charlie'))!
      expect(row.text()).not.toContain('1450')
      expect(row.text()).toContain('rankedLeaderboard.placementProgress')
    })

    it('does not shift the ranks of ranked players', () => {
      const wrapper = mountWithPlacement()
      const rankOf = (name: string) =>
        wrapper
          .findAllComponents(RouterLinkStub)
          .find((r) => r.text().includes(name))!
          .find('.w-5')
          .text()
      // Charlie would be 1st on their MMR: they take nobody's place.
      expect(rankOf('Alice')).toBe('1')
      expect(rankOf('Bob')).toBe('2')
    })

    it('with no placement matches configured, everyone is ranked', () => {
      const wrapper = mountWithPlacement({ placementMatches: 0 })
      expect(wrapper.text()).not.toContain('rankedLeaderboard.placementSection')
      expect(wrapper.text()).toContain('1450')
    })

    it('the section disappears once nobody is in placement anymore', () => {
      const wrapper = mountBoard({ players, placementMatches: 5 })
      expect(wrapper.text()).not.toContain('rankedLeaderboard.placementSection')
    })
  })

  // On mobile the views are neighboring panels in a draggable track, not a single
  // render: they're all mounted together so the finger can drag between them.
  describe('mobile', () => {
    beforeEach(() => {
      viewport.mobile = true
    })
    afterEach(() => {
      viewport.mobile = false
    })

    it('mounts the neighboring views and switches on tap', async () => {
      const wrapper = mountBoard({ provisionalPlayers: [] })
      expect(modeLabels(wrapper)).toEqual([
        'rankedLeaderboard.modeOfficial',
        'rankedLeaderboard.modeProvisional',
      ])

      // The provisional view is already mounted, so its data is requested right away.
      expect(wrapper.emitted('load-provisional')).toHaveLength(1)

      await selectMode(wrapper, 'Provisional')
      const selected = wrapper
        .findAll('[data-test^="subtab-"]')
        .filter((button) => button.attributes('aria-selected') === 'true')
      expect(selected.map((button) => button.text())).toEqual([
        'rankedLeaderboard.modeProvisional',
      ])
    })
  })

  // The next rank is looked up by order, not `level + 1`: a season edited
  // before the levels were recompacted can have gaps.
  describe('non-contiguous levels (1, 2, 4)', () => {
    const gapped = [
      makeTier({ id: 'bronze', level: 1, name: 'Bronze', minMmr: 700 }),
      makeTier({ id: 'silver', level: 2, name: 'Silver', minMmr: 900 }),
      makeTier({ id: 'gold', level: 4, name: 'Gold', minMmr: 1100 }),
    ]

    it('partial, non-full progress bar for a mid-rank player', () => {
      const wrapper = mountBoard({
        tiers: gapped,
        players: [
          makePlayerMmr({
            currentMmr: 1000,
            player: { id: 'u2', displayName: 'Bob', shortName: 'BO' },
          }),
        ],
      })
      // Silver 900 → Gold 1100, Bob at 1000 = half the range
      const bar = wrapper.find('[style*="width: 50%"]')
      expect(bar.exists()).toBe(true)
      expect(wrapper.find('[style*="width: 100%"]').exists()).toBe(false)
    })

    it('lowest rank threshold expressed relative to the next rank', () => {
      const wrapper = mountBoard({ tiers: gapped })
      expect(wrapper.text()).toContain('< 900 MMR')
    })
  })
})
