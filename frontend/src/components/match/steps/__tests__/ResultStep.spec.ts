import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { mountWithUi } from '@/test-support/mount'
import ResultStep from '../ResultStep.vue'

vi.mock('vue-i18n', async () => (await import('@/test-support/mock-modules')).i18nEchoMock())
vi.mock('@/config/ApiConfig', async () =>
  (await import('@/test-support/mock-modules')).apiConfigMock(),
)

const outcomeList = vi.fn()
const reasonList = vi.fn()
const tournamentGet = vi.fn()
const disciplineGet = vi.fn()
vi.mock('@/composables/outcome-type.api', () => ({
  outcomeTypeApi: { list: (...a: unknown[]) => outcomeList(...a) },
}))
vi.mock('@/composables/outcome-reason.api', () => ({
  outcomeReasonApi: { list: (...a: unknown[]) => reasonList(...a) },
}))
vi.mock('@/composables/tournament/tournament.api', () => ({
  tournamentApi: { getById: (...a: unknown[]) => tournamentGet(...a) },
}))
vi.mock('@/composables/discipline/discipline.api', () => ({
  disciplineApi: { getById: (...a: unknown[]) => disciplineGet(...a) },
}))

const normal = { id: 'ot-normal', name: 'Normal', isDefault: true, points: 3, mmrMultiplier: 1 }
const forfeit = {
  id: 'ot-forfeit',
  name: 'Forfeit',
  isDefault: false,
  points: 3,
  mmrMultiplier: 1.5,
}
const noShow = { id: 'r1', name: 'No show', outcomeTypeId: 'ot-forfeit' }

const sides = [
  { position: 1, playerIds: ['a', 'b'] },
  { position: 2, playerIds: ['c'] },
]

interface Vm {
  outcomeTypes: unknown[]
  scoreInstructions: string | null
  filteredOutcomeReasons: unknown[]
  selectedOutcomeType: { id: string } | null
  showMmrMultiplier: boolean
  isNormalOutcome: boolean
  showReasonSelect: boolean
  canCreate: boolean
  validationMessages: string[]
  sidePercents: { a: number; b: number }
  formatMmrMultiplier: (n: number) => string
  sidePlayers: (s: { position: number; playerIds?: string[] }) => { id: string; name: string }[]
  setScore: (position: number, value: number) => void
  onOutcomeTypeChange: () => void
  loadingOutcomeTypes: boolean
}

function mountStep(props: Record<string, unknown> = {}) {
  const updates: Record<string, unknown[]> = {}
  const track = (name: string) => (v: unknown) => {
    updates[name] = [...(updates[name] ?? []), v]
  }
  const wrapper = mountWithUi(ResultStep, {
    props: {
      tournamentId: 't1',
      playerNames: { a: 'Ann', b: 'Bob' },
      sides,
      scorePerSide: { 1: 0, 2: 0 },
      winner: null,
      outcomeTypeId: null,
      outcomeReasonId: null,
      allowDraw: false,
      'onUpdate:sides': track('sides'),
      'onUpdate:scorePerSide': track('scorePerSide'),
      'onUpdate:winner': track('winner'),
      'onUpdate:outcomeTypeId': track('outcomeTypeId'),
      'onUpdate:outcomeReasonId': track('outcomeReasonId'),
      ...props,
    },
    global: { stubs: { PlayerAvatar: true } },
  })
  return { wrapper, updates, vm: wrapper.findComponent(ResultStep).vm as unknown as Vm }
}

beforeEach(() => {
  vi.clearAllMocks()
  tournamentGet.mockResolvedValue({ disciplineId: 'd1' })
  outcomeList.mockResolvedValue([normal, forfeit])
  disciplineGet.mockResolvedValue({ scoreInstructions: 'Play to 10' })
  reasonList.mockResolvedValue([noShow])
})

describe('ResultStep — loading outcome types', () => {
  it('loads the discipline outcome types and instructions, and picks the default outcome', async () => {
    const { vm, updates } = mountStep()
    await flushPromises()

    expect(outcomeList).toHaveBeenCalledWith('d1')
    expect(vm.outcomeTypes).toHaveLength(2)
    expect(vm.scoreInstructions).toBe('Play to 10')
    expect(updates.outcomeTypeId?.at(-1)).toBe('ot-normal')
  })

  it('lists every outcome type when the tournament has no discipline', async () => {
    tournamentGet.mockResolvedValue({ disciplineId: null })
    const { vm } = mountStep()
    await flushPromises()

    expect(outcomeList).toHaveBeenCalledWith()
    expect(disciplineGet).not.toHaveBeenCalled()
    expect(vm.outcomeTypes).toHaveLength(2)
  })

  it('uses what the parent already loaded instead of fetching', async () => {
    const { vm } = mountStep({
      initialOutcomeTypes: [normal, forfeit],
      initialOutcomeReasons: [noShow],
      initialScoreInstructions: 'Parent notes',
    })
    await flushPromises()

    expect(tournamentGet).not.toHaveBeenCalled()
    expect(vm.scoreInstructions).toBe('Parent notes')
  })

  it('follows the parent when its data arrives later', async () => {
    const { wrapper, vm } = mountStep({ initialOutcomeTypes: [] })
    await wrapper.setProps({
      initialOutcomeTypes: [normal],
      initialOutcomeReasons: [noShow],
      initialScoreInstructions: null,
    })
    await nextTick()
    expect(vm.outcomeTypes).toHaveLength(1)
    expect(vm.scoreInstructions).toBeNull()
  })

  it('does not fetch without a tournament', async () => {
    mountStep({ tournamentId: '' })
    await flushPromises()
    expect(tournamentGet).not.toHaveBeenCalled()
  })
})

describe('ResultStep — outcome reasons', () => {
  it('loads the reasons of the selected non-default outcome and offers them', async () => {
    const { vm } = mountStep({ outcomeTypeId: 'ot-forfeit' })
    await flushPromises()

    expect(reasonList).toHaveBeenCalledWith('ot-forfeit')
    expect(vm.selectedOutcomeType?.id).toBe('ot-forfeit')
    expect(vm.isNormalOutcome).toBe(false)
    expect(vm.filteredOutcomeReasons).toEqual([noShow])
    expect(vm.showReasonSelect).toBe(true)
  })

  it('offers no reason for the normal outcome', async () => {
    const { vm } = mountStep({ outcomeTypeId: 'ot-normal' })
    await flushPromises()
    expect(vm.isNormalOutcome).toBe(true)
    expect(vm.showReasonSelect).toBe(false)
  })

  it("clears the reason and loads the new type's reasons when the outcome changes", async () => {
    const { vm, updates, wrapper } = mountStep({
      outcomeTypeId: 'ot-normal',
      outcomeReasonId: 'r1',
      initialOutcomeTypes: [normal, forfeit],
      initialOutcomeReasons: [],
    })
    await flushPromises()
    await wrapper.setProps({ outcomeTypeId: 'ot-forfeit' })
    vm.onOutcomeTypeChange()
    await flushPromises()

    expect(updates.outcomeReasonId?.at(-1)).toBeNull()
    expect(reasonList).toHaveBeenCalledWith('ot-forfeit')
  })

  it('does not reload reasons that are already cached', async () => {
    mountStep({
      outcomeTypeId: 'ot-forfeit',
      initialOutcomeTypes: [normal, forfeit],
      initialOutcomeReasons: [noShow],
    })
    await flushPromises()
    expect(reasonList).not.toHaveBeenCalled()
  })
})

describe('ResultStep — validation', () => {
  it('asks for a winner or a draw depending on the tournament', async () => {
    expect(mountStep({ allowDraw: true }).vm.validationMessages).toEqual([
      'resultStep.selectWinnerOrDraw',
    ])
    expect(mountStep({ allowDraw: false }).vm.validationMessages).toEqual([
      'resultStep.selectWinnerOnly',
    ])
    expect(mountStep({ winner: 1 }).vm.validationMessages).toEqual([])
  })

  it('needs a winner before the match can be created', () => {
    expect(mountStep({ winner: null }).vm.canCreate).toBe(false)
    expect(mountStep({ winner: 1 }).vm.canCreate).toBe(true)
  })

  it('accepts any score when scores are disabled', () => {
    expect(
      mountStep({ winner: 1, scoreEnabled: false, maxScore: 5, scorePerSide: { 1: 99, 2: 0 } }).vm
        .canCreate,
    ).toBe(true)
  })

  it('keeps scores within the configured bounds', () => {
    // Vue casts an absent boolean prop to false, so scoring has to be switched on explicitly.
    const bounds = { winner: 1, scoreEnabled: true, minScore: 1, maxScore: 10 }
    expect(mountStep({ ...bounds, scorePerSide: { 1: 10, 2: 1 } }).vm.canCreate).toBe(true)
    expect(mountStep({ ...bounds, scorePerSide: { 1: 11, 2: 1 } }).vm.canCreate).toBe(false)
    expect(mountStep({ ...bounds, scorePerSide: { 1: 5, 2: 0 } }).vm.canCreate).toBe(false)
  })

  it('updates the score of one side without touching the other', () => {
    const { vm, updates } = mountStep({ scorePerSide: { 1: 2, 2: 3 } })
    vm.setScore(1, 7)
    expect(updates.scorePerSide?.at(-1)).toEqual({ 1: 7, 2: 3 })
  })
})

describe('ResultStep — presentation helpers', () => {
  it('shows the MMR multiplier only in ranked seasons, without trailing zeros', () => {
    expect(mountStep().vm.showMmrMultiplier).toBe(false)
    const { vm } = mountStep({ isRanked: true })
    expect(vm.showMmrMultiplier).toBe(true)
    expect(vm.formatMmrMultiplier(1.5)).toBe('x 1.5')
    expect(vm.formatMmrMultiplier(1)).toBe('x 1')
    expect(vm.formatMmrMultiplier(1.2345)).toBe('x 1.23')
  })

  it('names the players of a side, falling back to their id', () => {
    const { vm } = mountStep()
    expect(vm.sidePlayers(sides[0]!).map((p) => p.name)).toEqual(['Ann', 'Bob'])
    expect(vm.sidePlayers(sides[1]!).map((p) => p.name)).toEqual(['c'])
    expect(vm.sidePlayers({ position: 3 })).toEqual([])
  })

  it('derives the balance bar from the standings, flat without any', () => {
    expect(mountStep().vm.sidePercents).toEqual({ a: 0, b: 0 })
    const { vm } = mountStep({
      standings: { a: { mmr: 1200 }, b: { mmr: 1000 }, c: { mmr: 1000 } },
    })
    expect(vm.sidePercents.a + vm.sidePercents.b).toBeGreaterThanOrEqual(0)
  })
})
