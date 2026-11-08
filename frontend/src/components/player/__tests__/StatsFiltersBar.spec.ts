import { describe, it, expect, vi } from 'vitest'
import { nextTick } from 'vue'
import type { PlayerStatsFilters, PlayerTournamentOption } from '@skol-arena/shared'
import { mountWithUi } from '@/test-support/mount'
import StatsFiltersBar from '../StatsFiltersBar.vue'

vi.mock('vue-i18n', async () => (await import('@/test-support/mock-modules')).i18nEchoMock())

const tournaments = [
  {
    id: 't1',
    name: 'Spring Cup',
    mode: 'championship',
    disciplineId: 'd1',
    disciplineName: 'Foosball',
  },
  { id: 't2', name: 'Ladder', mode: 'ranked', disciplineId: 'd1', disciplineName: 'Foosball' },
  { id: 't3', name: 'Knockout', mode: 'bracket', disciplineId: 'd2', disciplineName: 'Darts' },
] as PlayerTournamentOption[]

interface Exposed {
  selectedTournamentId?: string
  selectedDisciplineId?: string
  selectedMode?: string
  draftTournamentId?: string
  draftDisciplineId?: string
  draftMode?: string
  disciplineOptions: { label: string; value?: string }[]
  tournamentOptions: { label: string; value?: string }[]
  modeOptions: { label: string; value?: string }[]
  mobileTournamentOptions: { value?: string }[]
  mobileModeOptions: { value?: string }[]
  activeFilterCount: number
  activeFilterChips: { key: string; label: string }[]
  hasMultipleDisciplines: boolean
  isLocked: boolean
  modeLabel: (mode: string) => string
  modeColor: (mode: string) => string
  tabItems: (options: { label: string; value?: string }[]) => { label: string; value: string }[]
  selectedModeTab: string
  draftModeTab: string
  applyDraft: () => void
  resetDraft: () => void
  resetAll: () => void
}

function mountBar(props: Record<string, unknown> = {}) {
  const updates: PlayerStatsFilters[] = []
  const wrapper = mountWithUi(StatsFiltersBar, {
    props: {
      modelValue: {},
      'onUpdate:modelValue': (v: PlayerStatsFilters) => updates.push(v),
      availableTournaments: tournaments,
      ...props,
    },
  })
  const vm = wrapper.findComponent(StatsFiltersBar).vm as unknown as Exposed
  return { wrapper, vm, updates }
}

describe('StatsFiltersBar', () => {
  it('offers every discipline found in the tournaments, after the "all" option', () => {
    const { vm } = mountBar()
    expect(vm.disciplineOptions.map((o) => o.value)).toEqual([undefined, 'd1', 'd2'])
    expect(vm.hasMultipleDisciplines).toBe(true)
  })

  it('merges disciplines passed by the parent without duplicating them', () => {
    const { vm } = mountBar({
      disciplines: [
        { id: 'd1', name: 'Table football' },
        { id: 'd9', name: 'Chess' },
      ],
    })
    expect(vm.disciplineOptions.map((o) => o.value)).toEqual([undefined, 'd1', 'd9', 'd2'])
    expect(vm.disciplineOptions[1]!.label).toBe('Table football')
  })

  it('narrows tournaments and modes to the selected discipline', async () => {
    const { vm } = mountBar()
    vm.selectedDisciplineId = 'd1'
    await nextTick()
    expect(vm.tournamentOptions.map((o) => o.value)).toEqual([undefined, 't1', 't2'])
    expect(vm.modeOptions.map((o) => o.value)).toEqual([undefined, 'championship', 'ranked'])
  })

  it('restricts the modes to the allowed ones', () => {
    const { vm } = mountBar({ allowedModes: ['ranked'] })
    expect(vm.modeOptions.map((o) => o.value)).toEqual([undefined, 'ranked'])
    expect(vm.tournamentOptions.map((o) => o.value)).toEqual([undefined, 't2'])
  })

  it('publishes a tournament filter on its own, ignoring the other facets', async () => {
    const { vm, updates } = mountBar()
    vm.selectedMode = 'ranked'
    vm.selectedTournamentId = 't2'
    await nextTick()
    expect(updates.at(-1)).toEqual({ tournamentId: 't2' })
    expect(vm.isLocked).toBe(true)
    expect(vm.activeFilterCount).toBe(2)
  })

  it('publishes mode and discipline filters', async () => {
    const { vm, updates } = mountBar()
    vm.selectedDisciplineId = 'd1'
    vm.selectedMode = 'championship'
    await nextTick()
    expect(updates.at(-1)).toEqual({ tournamentMode: 'championship', disciplineId: 'd1' })
  })

  it('describes the active filters as chips', async () => {
    const { vm } = mountBar()
    vm.selectedTournamentId = 't1'
    vm.selectedMode = 'championship'
    vm.selectedDisciplineId = 'd1'
    await nextTick()
    expect(vm.activeFilterChips.map((c) => c.key)).toEqual(['tournament', 'mode', 'discipline'])
    expect(vm.activeFilterChips[0]!.label).toBe('Spring Cup')
    expect(vm.activeFilterChips[2]!.label).toBe('Foosball')
  })

  it('drops a mode that the new discipline does not offer', async () => {
    const { vm } = mountBar()
    vm.selectedMode = 'bracket'
    vm.selectedDisciplineId = 'd1'
    await nextTick()
    expect(vm.selectedMode).toBeUndefined()
  })

  it('keeps a mode the discipline does offer, and ignores clearing the discipline', async () => {
    const { vm } = mountBar()
    vm.selectedMode = 'ranked'
    vm.selectedDisciplineId = 'd1'
    await nextTick()
    expect(vm.selectedMode).toBe('ranked')
    vm.selectedDisciplineId = undefined
    await nextTick()
    expect(vm.selectedMode).toBe('ranked')
  })

  it('selects the only discipline automatically when asked to', async () => {
    const { wrapper, vm } = mountBar({ availableTournaments: [], autoSelectDiscipline: true })
    await wrapper.setProps({ availableTournaments: [tournaments[0]!, tournaments[1]!] })
    await nextTick()
    expect(vm.selectedDisciplineId).toBe('d1')
  })

  it('leaves the discipline alone when several exist or when not asked to', async () => {
    const asked = mountBar({ availableTournaments: [], autoSelectDiscipline: true })
    await asked.wrapper.setProps({ availableTournaments: tournaments })
    expect(asked.vm.selectedDisciplineId).toBeUndefined()

    const notAsked = mountBar({ availableTournaments: [] })
    await notAsked.wrapper.setProps({ availableTournaments: [tournaments[0]!] })
    expect(notAsked.vm.selectedDisciplineId).toBeUndefined()
  })

  it('resets everything', async () => {
    const { vm, updates } = mountBar({ modelValue: { tournamentMode: 'ranked' } })
    expect(vm.selectedMode).toBe('ranked')
    vm.resetAll()
    await nextTick()
    expect(vm.selectedMode).toBeUndefined()
    expect(updates.at(-1)).toEqual({})
  })

  describe('mobile drawer', () => {
    it('starts the draft from the committed filters when it opens', async () => {
      const { wrapper, vm } = mountBar()
      vm.selectedTournamentId = 't3'
      vm.selectedDisciplineId = 'd2'
      vm.selectedMode = 'bracket'
      await wrapper.setProps({ drawerVisible: true })
      await nextTick()
      expect([vm.draftTournamentId, vm.draftDisciplineId, vm.draftMode]).toEqual([
        't3',
        'd2',
        'bracket',
      ])
    })

    it('applies the draft to the committed filters and closes', async () => {
      const closed: boolean[] = []
      const { vm, wrapper } = mountBar({
        drawerVisible: true,
        'onUpdate:drawerVisible': (v: boolean) => closed.push(v),
      })
      vm.draftDisciplineId = 'd1'
      vm.draftMode = 'ranked'
      vm.applyDraft()
      await nextTick()
      expect(vm.selectedDisciplineId).toBe('d1')
      expect(vm.selectedMode).toBe('ranked')
      expect(closed.at(-1)).toBe(false)
      expect(wrapper.exists()).toBe(true)
    })

    it('clears the draft and prunes a mode the draft discipline lacks', async () => {
      const { vm } = mountBar()
      vm.draftMode = 'bracket'
      vm.draftDisciplineId = 'd1'
      await nextTick()
      expect(vm.draftMode).toBeUndefined()
      expect(vm.mobileModeOptions.map((o) => o.value)).toEqual([
        undefined,
        'championship',
        'ranked',
      ])
      vm.draftDisciplineId = 'd2'
      await nextTick()
      expect(vm.mobileTournamentOptions.map((o) => o.value)).toEqual([undefined, 't3'])
      vm.resetDraft()
      expect([vm.draftTournamentId, vm.draftDisciplineId, vm.draftMode]).toEqual([
        undefined,
        undefined,
        undefined,
      ])
    })
  })

  describe('helpers', () => {
    it('labels and colours each mode, falling back for unknown ones', () => {
      const { vm } = mountBar()
      expect(vm.modeLabel('championship')).toBe('statsFiltersBar.championship')
      expect(vm.modeLabel('bracket')).toBe('statsFiltersBar.bracket')
      expect(vm.modeLabel('ranked')).toBe('statsFiltersBar.ranked')
      expect(vm.modeLabel('mystery')).toBe('mystery')
      expect([
        vm.modeColor('championship'),
        vm.modeColor('bracket'),
        vm.modeColor('ranked'),
        vm.modeColor('x'),
      ]).toEqual(['info', 'warning', 'success', 'neutral'])
    })

    it('maps the undefined mode to the "all" tab and back', async () => {
      const { vm } = mountBar()
      expect(vm.tabItems([{ label: 'All' }, { label: 'Ranked', value: 'ranked' }])).toEqual([
        { label: 'All', value: 'all' },
        { label: 'Ranked', value: 'ranked' },
      ])
      expect(vm.selectedModeTab).toBe('all')
      vm.selectedModeTab = 'ranked'
      await nextTick()
      expect(vm.selectedMode).toBe('ranked')
      vm.selectedModeTab = 'all'
      await nextTick()
      expect(vm.selectedMode).toBeUndefined()
      vm.draftModeTab = 'bracket'
      expect(vm.draftMode).toBe('bracket')
    })
  })
})
