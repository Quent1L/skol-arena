import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises, RouterLinkStub } from '@vue/test-utils'
import type { StandingsEntry } from '@skol-arena/shared'
import { mountWithUi } from '@/test-support/mount'
import { makeStandingRow } from '@/test-support/factories'
import { useStandingsService } from '@/composables/standings.service'
import StandingsTable from '../StandingsTable.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
  createI18n: () => ({ global: { t: (key: string) => key }, install: () => {} }),
}))
vi.mock('@/composables/standings.service')
vi.mock('@/composables/outcome-type.api')
const isMobile = ref(false)
vi.mock('@/composables/useViewport.ts', () => ({
  useViewport: () => ({ isMobile }),
}))
vi.mock('@/composables/useViewport', () => ({
  useViewport: () => ({ isMobile }),
}))

const standings = ref<StandingsEntry[]>([])
const loadOfficialStandings = vi.fn()
const loadProvisionalStandings = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  isMobile.value = false
  loadOfficialStandings.mockResolvedValue(undefined)
  loadProvisionalStandings.mockResolvedValue(undefined)
  standings.value = [
    makeStandingRow({ id: 'p1', name: 'Alice', shortName: 'AL', points: 9, wins: 3, matchesPlayed: 3 }),
    makeStandingRow({ id: 'p2', name: 'Bob', shortName: 'BO', points: 3, wins: 1, matchesPlayed: 3 }),
  ]
  vi.mocked(useStandingsService).mockReturnValue({
    standings,
    loading: ref(false),
    error: ref(null),
    loadOfficialStandings,
    loadProvisionalStandings,
  } as unknown as ReturnType<typeof useStandingsService>)
})

async function mountTable(props: Record<string, unknown> = {}) {
  // showProvisionalToggle is an optional Boolean prop: absent, Vue casts it to false
  const wrapper = mountWithUi(StandingsTable, {
    props: { tournamentId: 't1', showProvisionalToggle: true, ...props },
  })
  await flushPromises()
  return wrapper
}

describe('StandingsTable', () => {
  it('loads the official standings on mount and renders one row per entry', async () => {
    const wrapper = await mountTable()
    expect(loadOfficialStandings).toHaveBeenCalledWith('t1')
    expect(loadProvisionalStandings).not.toHaveBeenCalled()
    expect(wrapper.findAll('[data-testid="standings-row"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('Alice')
    expect(wrapper.text()).toContain('Bob')
  })

  it('flex mode: rows link to the player profile', async () => {
    const wrapper = await mountTable({ teamMode: 'flex' })
    const links = wrapper.findAllComponents(RouterLinkStub)
    expect(links).toHaveLength(2)
    expect(links[0].props('to')).toEqual({ path: '/players/p1', query: { tournamentId: 't1' } })
  })

  it('static mode: no player link', async () => {
    const wrapper = await mountTable({ teamMode: 'static' })
    expect(wrapper.findAllComponents(RouterLinkStub)).toHaveLength(0)
  })

  it('highlights the current user', async () => {
    const wrapper = await mountTable({ currentUserId: 'p2' })
    const rows = wrapper.findAll('[data-testid="standings-row"]')
    expect(rows[1].text()).toContain('rankedLeaderboard.you')
    expect(rows[0].text()).not.toContain('rankedLeaderboard.you')
  })

  it('desktop: the sidebar switches to the provisional standings', async () => {
    const wrapper = await mountTable()
    await wrapper.find('[data-test="subtab-provisional"]').trigger('click')
    await flushPromises()
    expect(loadProvisionalStandings).toHaveBeenCalledWith('t1')
  })

  it('refetches a view each time it is shown again', async () => {
    const wrapper = await mountTable()
    await wrapper.find('[data-test="subtab-provisional"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-test="subtab-official"]').trigger('click')
    await flushPromises()
    expect(loadOfficialStandings).toHaveBeenCalledTimes(2)
    expect(loadProvisionalStandings).toHaveBeenCalledTimes(1)
  })

  it('mobile: the same views sit in the draggable track used by ranked', async () => {
    isMobile.value = true
    const wrapper = await mountTable()
    expect(wrapper.findComponent({ name: 'SubTabTrack' }).exists()).toBe(true)
  })

  it('without validation: a single view and no switcher, on mobile as on desktop', async () => {
    for (const mobile of [false, true]) {
      isMobile.value = mobile
      const wrapper = await mountTable({ showProvisionalToggle: false })
      expect(wrapper.findComponent({ name: 'SubTabTrack' }).exists()).toBe(false)
      expect(wrapper.find('[data-test="subtab-provisional"]').exists()).toBe(false)
      expect(wrapper.findAll('[data-testid="standings-row"]')).toHaveLength(2)
    }
  })

  it('large screens: tiebreakers as labelled columns', async () => {
    const wrapper = await mountTable({ allowDraw: true })
    const header = wrapper.find('[data-testid="standings-columns"]')
    expect(header.text()).toContain('standingsTable.columnBuchholz')
    expect(header.text()).toContain('standingsTable.columnVictoryQuality')
    expect(header.text()).toContain('standingsTable.columnWinRate')
    expect(header.text()).toContain('standingsTable.columnWinLossRatio')

    const noDraw = await mountTable({ allowDraw: false })
    expect(noDraw.find('[data-testid="standings-columns"]').text()).not.toContain(
      'standingsTable.columnWinLossRatio',
    )
  })

  it('empty standings: dedicated message', async () => {
    standings.value = []
    const wrapper = await mountTable()
    expect(wrapper.text()).toContain('standingsTable.noStandings')
  })

  it('draws appear in the record only if allowDraw', async () => {
    const withDraw = await mountTable({ allowDraw: true })
    expect(withDraw.text()).toContain('standingsTable.columnDraws')

    const noDraw = await mountTable({ allowDraw: false })
    expect(noDraw.text()).not.toContain('standingsTable.columnDraws')
  })
})
