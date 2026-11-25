import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { mountWithUi } from '@/test-support/mount'
import ParticipantsStep from '../ParticipantsStep.vue'

vi.mock('vue-i18n', async () => (await import('@/test-support/mock-modules')).i18nEchoMock())
vi.mock('@/config/ApiConfig', async () =>
  (await import('@/test-support/mock-modules')).apiConfigMock(),
)

const getTournamentParticipants = vi.fn()
vi.mock('@/composables/participant.service', () => ({
  useParticipantService: () => ({ getTournamentParticipants }),
}))
const validateParticipants = vi.fn()
vi.mock('@/composables/match/match.service', () => ({
  useMatchService: () => ({ validateParticipants }),
}))
const isMobile = ref(false)
vi.mock('@/composables/useViewport', () => ({ useViewport: () => ({ isMobile }) }))

const roster = [
  { userId: 'a', user: { displayName: 'Ann' } },
  { userId: 'b', user: { displayName: 'Bob' } },
  { userId: 'c', user: { displayName: 'Cécile' } },
]

interface Vm {
  allPlayers: { id: string; displayName: string }[]
  filteredPlayers: { id: string }[]
  searchQuery: string
  pickedPlayer?: { id: string }
  errors: string[]
  warnings: string[]
  validating: boolean
  loadingPlayers: boolean
  addPlayer: (p?: { id: string; displayName: string }) => void
  removePlayer: (id: string) => void
  getPlayerName: (id: string) => string
  runValidation: () => Promise<{ valid: boolean } | undefined>
  onNext: () => Promise<void>
}

function mountStep(props: Record<string, unknown> = {}) {
  const updates: string[][] = []
  const wrapper = mountWithUi(ParticipantsStep, {
    props: {
      tournamentId: 't1',
      allPlayerIds: [],
      'onUpdate:allPlayerIds': (v: string[]) => updates.push(v),
      ...props,
    },
    global: { stubs: { PlayerAvatar: true, PlayerPickerDialog: true } },
  })
  return { wrapper, updates, vm: wrapper.findComponent(ParticipantsStep).vm as unknown as Vm }
}

beforeEach(() => {
  vi.clearAllMocks()
  isMobile.value = false
  getTournamentParticipants.mockResolvedValue(roster)
  validateParticipants.mockResolvedValue({ valid: true, errors: [], warnings: [] })
})

describe('ParticipantsStep — roster', () => {
  it('loads the tournament participants when the parent gave none', async () => {
    const { vm } = mountStep()
    expect(vm.loadingPlayers).toBe(true)
    await flushPromises()
    expect(getTournamentParticipants).toHaveBeenCalledWith('t1')
    expect(vm.allPlayers.map((p) => p.displayName)).toEqual(['Ann', 'Bob', 'Cécile'])
    expect(vm.loadingPlayers).toBe(false)
  })

  it('uses the players the parent already loaded, and follows them', async () => {
    const { wrapper, vm } = mountStep({ players: [{ id: 'x', displayName: 'Xena' }] })
    await flushPromises()
    expect(getTournamentParticipants).not.toHaveBeenCalled()
    expect(vm.allPlayers).toEqual([{ id: 'x', displayName: 'Xena' }])
    await wrapper.setProps({ players: [{ id: 'y', displayName: 'Yan' }] })
    expect(vm.allPlayers).toEqual([{ id: 'y', displayName: 'Yan' }])
  })

  it('filters the roster by search, accent-insensitively, hiding already picked players', async () => {
    const { vm } = mountStep({ allPlayerIds: ['a'] })
    await flushPromises()
    expect(vm.filteredPlayers.map((p) => p.id)).toEqual(['b', 'c'])
    vm.searchQuery = 'cecile'
    await nextTick()
    expect(vm.filteredPlayers.map((p) => p.id)).toEqual(['c'])
  })

  it('names a player, falling back to the id', async () => {
    const { vm } = mountStep()
    await flushPromises()
    expect(vm.getPlayerName('a')).toBe('Ann')
    expect(vm.getPlayerName('ghost')).toBe('ghost')
  })
})

describe('ParticipantsStep — picking', () => {
  it('adds a player once and clears the search afterwards', async () => {
    vi.useFakeTimers()
    const { vm, updates } = mountStep({ allPlayerIds: ['a'] })
    vm.searchQuery = 'bo'
    vm.addPlayer({ id: 'b', displayName: 'Bob' })
    expect(updates.at(-1)).toEqual(['a', 'b'])
    vi.advanceTimersByTime(1)
    expect(vm.searchQuery).toBe('')
    expect(vm.pickedPlayer).toBeUndefined()
    vi.useRealTimers()
  })

  it('ignores an empty pick or one already selected', () => {
    const { vm, updates } = mountStep({ allPlayerIds: ['a'] })
    vm.addPlayer(undefined)
    vm.addPlayer({ id: 'a', displayName: 'Ann' })
    expect(updates).toEqual([])
  })

  it('removes a player', () => {
    const { vm, updates } = mountStep({ allPlayerIds: ['a', 'b'] })
    vm.removePlayer('a')
    expect(updates.at(-1)).toEqual(['b'])
  })
})

describe('ParticipantsStep — validation', () => {
  it('asks the server to validate the selection for the date and match, and keeps its feedback', async () => {
    validateParticipants.mockResolvedValue({
      valid: false,
      errors: ['too few'],
      warnings: ['careful'],
    })
    const when = new Date('2026-01-01')
    const { vm } = mountStep({ allPlayerIds: ['a', 'b'], playedAt: when, matchId: 'm1' })
    const result = await vm.runValidation()
    expect(validateParticipants).toHaveBeenCalledWith('t1', ['a', 'b'], when, 'm1')
    expect(result?.valid).toBe(false)
    expect([vm.errors, vm.warnings]).toEqual([['too few'], ['careful']])
    expect(vm.validating).toBe(false)
  })

  it('clears the feedback when the selection changes', async () => {
    validateParticipants.mockResolvedValue({ valid: false, errors: ['x'], warnings: ['y'] })
    const { vm, wrapper } = mountStep({ allPlayerIds: ['a', 'b'] })
    await vm.runValidation()
    await wrapper.setProps({ allPlayerIds: ['a'] })
    expect(vm.errors).toEqual([])
    expect(vm.warnings).toEqual([])
  })

  it('moves on only when the selection is valid', async () => {
    const { vm, wrapper } = mountStep({ allPlayerIds: ['a', 'b'] })
    await vm.onNext()
    expect(wrapper.findComponent(ParticipantsStep).emitted('next')).toHaveLength(1)

    validateParticipants.mockResolvedValue({ valid: false, errors: ['no'], warnings: [] })
    await vm.onNext()
    expect(wrapper.findComponent(ParticipantsStep).emitted('next')).toHaveLength(1)
  })

  it('clears the validating flag even when the validation throws', async () => {
    validateParticipants.mockRejectedValue(new Error('down'))
    const { vm } = mountStep({ allPlayerIds: ['a', 'b'] })
    await expect(vm.runValidation()).rejects.toThrow('down')
    expect(vm.validating).toBe(false)
  })
})

describe('ParticipantsStep — tournament format', () => {
  it('states the format upfront', () => {
    const { wrapper } = mountStep({ players: [], minTeamSize: 1, maxTeamSize: 1 })
    expect(wrapper.find('[data-testid="format-hint"]').text()).toBe(
      'participantsStep.formatHint.exact',
    )
  })

  it('flags one player too many at once and blocks Next without asking the server', async () => {
    const { wrapper, vm } = mountStep({
      players: [],
      allPlayerIds: ['a', 'b', 'c'],
      minTeamSize: 1,
      maxTeamSize: 1,
    })
    expect(wrapper.find('[data-testid="too-many-players"]').text()).toContain(
      'participantsStep.tooMany.exact#3',
    )
    await vm.onNext()
    expect(validateParticipants).not.toHaveBeenCalled()
  })

  it('lets an N-way solo competition take one player per side', () => {
    const { wrapper } = mountStep({
      players: [],
      allPlayerIds: ['a', 'b', 'c'],
      minTeamSize: 1,
      maxTeamSize: 1,
      maxSides: 3,
    })
    expect(wrapper.find('[data-testid="too-many-players"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="format-hint"]').text()).toBe(
      'participantsStep.formatHint.nway',
    )
  })

  it('accepts a selection within a range of formats', () => {
    const { wrapper } = mountStep({
      players: [],
      allPlayerIds: ['a', 'b', 'c'],
      minTeamSize: 1,
      maxTeamSize: 2,
    })
    expect(wrapper.find('[data-testid="too-many-players"]').exists()).toBe(false)
  })
})
