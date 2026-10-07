import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defineComponent, inject, ref, Fragment } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { useRoute } from 'vue-router'
import { mountWithPrime } from '@/test-support/mount'
import { makeAuthMock, type AuthMockState } from '@/test-support/mock-modules'
import { makeTournament } from '@/test-support/factories'
import { useAuth } from '@/composables/useAuth'
import { useViewport } from '@/composables/useViewport'
import { useAppToast } from '@/composables/useAppToast'
import { useMatchService } from '@/composables/match/match.service'
import { useTournamentService } from '@/composables/tournament/tournament.service'
import { useTeamService } from '@/composables/team/team.service'
import { useParticipantService } from '@/composables/participant.service'
import { outcomeTypeApi } from '@/composables/outcome-type.api'
import { outcomeReasonApi } from '@/composables/outcome-reason.api'
import { disciplineApi } from '@/composables/discipline/discipline.api'
import { MATCH_FORM_KEY, type MatchFormContext } from '@/composables/match/match-form.context'
import MatchFormSkeleton from '@/components/match/MatchFormSkeleton.vue'
import CreateMatchView from '../CreateMatchView.vue'
import type {
  BaseTournament,
  ClientBaseTournament,
  ClientMatchDetail,
  ParticipantListItem,
  OutcomeType,
  Discipline,
  MatchStatus,
} from '@skol-arena/shared'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
  createI18n: () => ({ global: { t: (key: string) => key }, install: () => {} }),
}))
vi.mock('vue-router', () => ({ useRoute: vi.fn() }))
vi.mock('@/composables/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('@/composables/useViewport', () => ({ useViewport: vi.fn() }))
vi.mock('@/composables/useAppToast', () => ({ useAppToast: vi.fn() }))
vi.mock('@/composables/match/match.service', () => ({ useMatchService: vi.fn() }))
vi.mock('@/composables/tournament/tournament.service', () => ({ useTournamentService: vi.fn() }))
vi.mock('@/composables/team/team.service', () => ({ useTeamService: vi.fn() }))
vi.mock('@/composables/participant.service', () => ({ useParticipantService: vi.fn() }))
vi.mock('@/composables/outcome-type.api')
vi.mock('@/composables/outcome-reason.api')
vi.mock('@/composables/discipline/discipline.api')

function makeClientTournament(over: Partial<ClientBaseTournament> = {}): ClientBaseTournament {
  const base = makeTournament(over as Partial<BaseTournament>)
  return {
    ...base,
    startDate: new Date(base.startDate),
    endDate: new Date(base.endDate),
    createdAt: new Date(base.createdAt),
    updatedAt: new Date(base.updatedAt),
    ...over,
  } as ClientBaseTournament
}

function makeParticipant(userId: string, displayName: string): ParticipantListItem {
  return {
    id: `p-${userId}`,
    userId,
    teamId: null,
    matchesPlayed: 0,
    joinedAt: new Date('2026-01-01'),
    user: { id: userId, displayName, role: 'player' },
  }
}

function makeOutcomeType(over: Partial<OutcomeType> = {}): OutcomeType {
  return {
    id: 'ot-1',
    disciplineId: 'd1',
    name: 'Normal',
    isDefault: false,
    scoreCountsForMmr: true,
    points: 3,
    mmrMultiplier: 1,
    ...over,
  }
}

function makeMatchDetail(over: Partial<ClientMatchDetail> = {}): ClientMatchDetail {
  return {
    id: 'm1',
    tournamentId: 't1',
    status: 'reported' as MatchStatus,
    playedAt: new Date('2026-06-01'),
    createdAt: new Date('2026-06-01'),
    outcomeTypeId: 'ot-1',
    outcomeReasonId: null,
    sides: [
      {
        position: 1,
        score: 3,
        pointsAwarded: 3,
        isWinner: true,
        entryId: 'e1',
        entryName: null,
        players: [{ id: 'u1', displayName: 'Alice', shortName: 'AL' }],
      },
      {
        position: 2,
        score: 1,
        pointsAwarded: 0,
        isWinner: false,
        entryId: 'e2',
        entryName: null,
        players: [{ id: 'u2', displayName: 'Bob', shortName: 'BO' }],
      },
    ],
    ...over,
  } as ClientMatchDetail
}

function makeProbe(name: string) {
  return defineComponent({
    name,
    props: { tournamentId: String, matchId: String, bracketLocked: Boolean, resultOnly: Boolean },
    setup() {
      return { ...(inject(MATCH_FORM_KEY) as MatchFormContext) }
    },
    template: '<div />',
  })
}
const MobileProbe = makeProbe('MobileProbe')
const DesktopProbe = makeProbe('DesktopProbe')

function getProbe(wrapper: Awaited<ReturnType<typeof mountView>>) {
  const mobile = wrapper.findComponent(MobileProbe)
  return mobile.exists() ? mobile : wrapper.findComponent(DesktopProbe)
}

let loadTournamentMock: ReturnType<typeof vi.fn>
let setPlayersMapMock: ReturnType<typeof vi.fn>
let getMatchMock: ReturnType<typeof vi.fn>
let loadTeamsMock: ReturnType<typeof vi.fn>
let getParticipantsMock: ReturnType<typeof vi.fn>
let participantsErrorRef: ReturnType<typeof ref<string | null>>
let toastAddMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(useViewport).mockReturnValue({ width: ref(1280), isMobile: ref(false) })

  toastAddMock = vi.fn()
  vi.mocked(useAppToast).mockReturnValue({ add: toastAddMock } as unknown as ReturnType<
    typeof useAppToast
  >)

  loadTournamentMock = vi.fn().mockResolvedValue(makeClientTournament())
  vi.mocked(useTournamentService).mockReturnValue({
    loadTournamentWithErrorHandling: loadTournamentMock,
  } as unknown as ReturnType<typeof useTournamentService>)

  setPlayersMapMock = vi.fn()
  getMatchMock = vi.fn()
  vi.mocked(useMatchService).mockReturnValue({
    playersMap: ref({}),
    setPlayersMap: setPlayersMapMock,
    getMatch: getMatchMock,
  } as unknown as ReturnType<typeof useMatchService>)

  loadTeamsMock = vi.fn().mockResolvedValue(undefined)
  vi.mocked(useTeamService).mockReturnValue({
    teams: ref([]),
    loadTeams: loadTeamsMock,
  } as unknown as ReturnType<typeof useTeamService>)

  getParticipantsMock = vi.fn().mockResolvedValue([
    makeParticipant('u1', 'Alice'),
    makeParticipant('u2', 'Bob'),
  ])
  participantsErrorRef = ref<string | null>(null)
  vi.mocked(useParticipantService).mockReturnValue({
    getTournamentParticipants: getParticipantsMock,
    error: participantsErrorRef,
  } as unknown as ReturnType<typeof useParticipantService>)

  vi.mocked(outcomeTypeApi.list).mockResolvedValue([
    makeOutcomeType({ id: 'ot-default', isDefault: true }),
  ])
  vi.mocked(outcomeReasonApi.list).mockResolvedValue([])
  vi.mocked(disciplineApi.getById).mockResolvedValue({
    id: 'd1',
    name: 'Chess',
    scoreInstructions: 'Enter final score',
  } as Discipline)
})

async function mountView(
  routeOverrides: { tournamentId?: string; matchId?: string } = {},
  authOverrides: Partial<AuthMockState> = {},
) {
  vi.mocked(useRoute).mockReturnValue({
    params: { tournamentId: routeOverrides.tournamentId ?? 't1' },
    query: { matchId: routeOverrides.matchId },
  } as unknown as ReturnType<typeof useRoute>)

  vi.mocked(useAuth).mockReturnValue(
    makeAuthMock({
      user: { id: 'u1', email: 'u1@test.dev' },
      role: 'player',
      initialized: true,
      ...authOverrides,
    }) as unknown as ReturnType<typeof useAuth>,
  )

  const wrapper = mountWithPrime(CreateMatchView, {
    global: {
      stubs: { MatchFormStepperMobile: MobileProbe, MatchFormStepperDesktop: DesktopProbe },
    },
  })
  await flushPromises()
  return wrapper
}

/** Mounts without awaiting the loaders, to observe the loading state itself. */
function mountUnresolved() {
  vi.mocked(useRoute).mockReturnValue({
    params: { tournamentId: 't1' },
    query: {},
  } as unknown as ReturnType<typeof useRoute>)
  vi.mocked(useAuth).mockReturnValue(
    makeAuthMock({
      user: { id: 'u1', email: 'u1@test.dev' },
      role: 'player',
      initialized: true,
    }) as unknown as ReturnType<typeof useAuth>,
  )
  return mountWithPrime(CreateMatchView, {
    global: {
      stubs: { MatchFormStepperMobile: MobileProbe, MatchFormStepperDesktop: DesktopProbe },
    },
  })
}

describe('CreateMatchView', () => {
  it('loads tournament, playersMap, participants then result data on mount', async () => {
    await mountView()
    expect(loadTournamentMock).toHaveBeenCalledWith('t1')
    expect(getParticipantsMock).toHaveBeenCalledWith('t1')
    expect(setPlayersMapMock).toHaveBeenCalledWith([
      makeParticipant('u1', 'Alice'),
      makeParticipant('u2', 'Bob'),
    ])
    expect(outcomeTypeApi.list).toHaveBeenCalled()
  })

  it('fetches the participants once: the players map is built from the same payload', async () => {
    await mountView()
    expect(getParticipantsMock).toHaveBeenCalledTimes(1)
  })

  it('shows the skeleton until the data lands, then the stepper', async () => {
    const wrapper = mountUnresolved()
    expect(wrapper.findComponent(MatchFormSkeleton).exists()).toBe(true)
    expect(wrapper.findComponent(DesktopProbe).exists()).toBe(false)

    await flushPromises()
    expect(wrapper.findComponent(MatchFormSkeleton).exists()).toBe(false)
    expect(wrapper.findComponent(DesktopProbe).exists()).toBe(true)
  })

  it('isLoading becomes false once mounting is finished', async () => {
    const wrapper = await mountView()
    expect(getProbe(wrapper).vm.isLoading).toBe(false)
  })

  it('static mode: loads teams, and the participants for the players map', async () => {
    loadTournamentMock.mockResolvedValue(makeClientTournament({ teamMode: 'static' }))
    await mountView()
    expect(loadTeamsMock).toHaveBeenCalledWith('t1')
    expect(getParticipantsMock).toHaveBeenCalledTimes(1)
    expect(setPlayersMapMock).toHaveBeenCalled()
  })

  it('flex mode: loads participants and does not load teams', async () => {
    loadTournamentMock.mockResolvedValue(makeClientTournament({ teamMode: 'flex' }))
    await mountView()
    expect(getParticipantsMock).toHaveBeenCalledWith('t1')
    expect(loadTeamsMock).not.toHaveBeenCalled()
  })

  it('tournament fails to load: error state instead of an empty form', async () => {
    loadTournamentMock.mockResolvedValue(null)
    const wrapper = await mountView()
    expect(wrapper.findComponent(DesktopProbe).exists()).toBe(false)
    expect(wrapper.findComponent(MatchFormSkeleton).exists()).toBe(false)
    expect(wrapper.text()).toContain('createMatchView.loadError')
  })

  it('participants fail to load: error state, since the service returns empty', async () => {
    getParticipantsMock.mockImplementation(async () => {
      participantsErrorRef.value = 'boom'
      return []
    })
    const wrapper = await mountView()
    expect(wrapper.findComponent(DesktopProbe).exists()).toBe(false)
    expect(wrapper.text()).toContain('createMatchView.loadError')
  })

  it('a throw inside the chain never leaves the skeleton up', async () => {
    loadTournamentMock.mockRejectedValue(new Error('offline'))
    const wrapper = await mountView()
    expect(wrapper.findComponent(MatchFormSkeleton).exists()).toBe(false)
    expect(wrapper.text()).toContain('createMatchView.loadError')
  })

  it('retry re-runs the loaders and shows the form', async () => {
    loadTournamentMock.mockResolvedValueOnce(null)
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('createMatchView.loadError')

    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(loadTournamentMock).toHaveBeenCalledTimes(2)
    expect(wrapper.findComponent(DesktopProbe).exists()).toBe(true)
  })

  it('non-admin participant user: auto-added to allPlayerIds', async () => {
    const wrapper = await mountView({}, { role: 'player' })
    expect(getProbe(wrapper).vm.formState.allPlayerIds).toEqual(['u1'])
  })

  it('admin user: not auto-added to allPlayerIds', async () => {
    const wrapper = await mountView({}, { role: 'tournament_admin' })
    expect(getProbe(wrapper).vm.formState.allPlayerIds).toEqual([])
  })

  it('non-participant user: not auto-added to allPlayerIds', async () => {
    const wrapper = await mountView({}, { user: { id: 'u9', email: 'u9@test.dev' }, role: 'player' })
    expect(getProbe(wrapper).vm.formState.allPlayerIds).toEqual([])
  })

  it('editing with matchId: allPlayerIds reflects the match’s players, not the auto-add', async () => {
    getMatchMock.mockResolvedValue(makeMatchDetail())
    const wrapper = await mountView({ matchId: 'm1' }, { role: 'player' })
    expect(getProbe(wrapper).vm.formState.allPlayerIds).toEqual(['u1', 'u2'])
  })

  it('matchId present: calls getMatch and populates formState', async () => {
    getMatchMock.mockResolvedValue(makeMatchDetail())
    const wrapper = await mountView({ matchId: 'm1' })
    expect(getMatchMock).toHaveBeenCalledWith('m1')
    const formState = getProbe(wrapper).vm.formState
    expect(formState.playedAt).toEqual(new Date('2026-06-01'))
    expect(formState.scorePerSide).toEqual({ 1: 3, 2: 1 })
    expect(formState.outcomeTypeId).toBe('ot-1')
    expect(formState.outcomeReasonId).toBeNull()
    expect(formState.winnerPosition).toBe(1)
    expect(formState.sides).toEqual([
      { position: 1, playerIds: ['u1'] },
      { position: 2, playerIds: ['u2'] },
    ])
  })

  it.each(['reported', 'pending_confirmation'] as const)(
    'status %s: activeStep switches to "result"',
    async (status) => {
      getMatchMock.mockResolvedValue(makeMatchDetail({ status }))
      const wrapper = await mountView({ matchId: 'm1' })
      expect(getProbe(wrapper).vm.activeStep).toBe('result')
    },
  )

  it('status finalized: only the result step, as a correction', async () => {
    getMatchMock.mockResolvedValue(makeMatchDetail({ status: 'finalized' }))
    const wrapper = await mountView({ matchId: 'm1' })
    expect(getProbe(wrapper).vm.activeStep).toBe('result')
    expect(getProbe(wrapper).props('resultOnly')).toBe(true)
  })

  it('status reported: the earlier steps stay reachable', async () => {
    getMatchMock.mockResolvedValue(makeMatchDetail({ status: 'reported' }))
    const wrapper = await mountView({ matchId: 'm1' })
    expect(getProbe(wrapper).props('resultOnly')).toBe(false)
  })

  it('status scheduled: activeStep stays "when"', async () => {
    getMatchMock.mockResolvedValue(makeMatchDetail({ status: 'scheduled' }))
    const wrapper = await mountView({ matchId: 'm1' })
    expect(getProbe(wrapper).vm.activeStep).toBe('when')
  })

  it('getMatch fails: shows an error toast without crashing', async () => {
    getMatchMock.mockRejectedValue(new Error('boom'))
    await mountView({ matchId: 'm1' })
    expect(toastAddMock).toHaveBeenCalledWith({
      severity: 'error',
      summary: 'createMatchView.errorSummary',
      detail: 'createMatchView.loadMatchError',
      life: 3000,
    })
  })

  it('with no matchId: getMatch never called, activeStep stays "when"', async () => {
    const wrapper = await mountView()
    expect(getMatchMock).not.toHaveBeenCalled()
    expect(getProbe(wrapper).vm.activeStep).toBe('when')
  })

  it('discipline present: loads the linked types + the score instructions', async () => {
    loadTournamentMock.mockResolvedValue(makeClientTournament({ disciplineId: 'd1' }))
    const wrapper = await mountView()
    expect(outcomeTypeApi.list).toHaveBeenCalledWith('d1')
    expect(disciplineApi.getById).toHaveBeenCalledWith('d1')
    expect(getProbe(wrapper).vm.scoreInstructions).toBe('Enter final score')
  })

  it('without a discipline: loads all types, no discipline call', async () => {
    loadTournamentMock.mockResolvedValue(makeClientTournament({ disciplineId: undefined }))
    const wrapper = await mountView()
    expect(outcomeTypeApi.list).toHaveBeenCalledWith()
    expect(disciplineApi.getById).not.toHaveBeenCalled()
    expect(getProbe(wrapper).vm.scoreInstructions).toBeNull()
  })

  it('creation: selects the default type and loads its reasons', async () => {
    const wrapper = await mountView()
    expect(getProbe(wrapper).vm.formState.outcomeTypeId).toBe('ot-default')
    expect(outcomeReasonApi.list).toHaveBeenCalledWith('ot-default')
  })

  it('editing with outcomeTypeId already set: ignores the default type', async () => {
    getMatchMock.mockResolvedValue(makeMatchDetail({ outcomeTypeId: 'ot-1' }))
    await mountView({ matchId: 'm1' })
    expect(outcomeReasonApi.list).toHaveBeenCalledWith('ot-1')
  })

  it('no default type and no matchId: outcomeTypeId stays null, no reasons call', async () => {
    vi.mocked(outcomeTypeApi.list).mockResolvedValue([makeOutcomeType({ isDefault: false })])
    const wrapper = await mountView()
    expect(getProbe(wrapper).vm.formState.outcomeTypeId).toBeNull()
    expect(outcomeReasonApi.list).not.toHaveBeenCalled()
  })

  it('playedAt in the future: resets winner/score/outcome', async () => {
    const wrapper = await mountView()
    const probe = getProbe(wrapper)
    const future = new Date(Date.now() + 86_400_000)
    probe.vm.formState.playedAt = future
    await flushPromises()
    expect(probe.vm.formState.winnerPosition).toBeNull()
    expect(probe.vm.formState.scorePerSide).toEqual({ 1: 0, 2: 0 })
    expect(probe.vm.formState.outcomeTypeId).toBeNull()
    expect(probe.vm.formState.outcomeReasonId).toBeNull()
  })

  it('playedAt in the past: resets nothing', async () => {
    const wrapper = await mountView()
    const probe = getProbe(wrapper)
    probe.vm.formState.outcomeTypeId = 'ot-default'
    const past = new Date('2020-01-01')
    probe.vm.formState.playedAt = past
    await flushPromises()
    expect(probe.vm.formState.outcomeTypeId).toBe('ot-default')
  })

  it('playedAt null: no reset and no error', async () => {
    const wrapper = await mountView()
    const probe = getProbe(wrapper)
    probe.vm.formState.outcomeTypeId = 'ot-default'
    probe.vm.formState.playedAt = null
    await flushPromises()
    expect(probe.vm.formState.outcomeTypeId).toBe('ot-default')
  })

  it('isMobile=true: renders the mobile stepper', async () => {
    vi.mocked(useViewport).mockReturnValue({ width: ref(400), isMobile: ref(true) })
    const wrapper = await mountView()
    expect(wrapper.findComponent(MobileProbe).exists()).toBe(true)
    expect(wrapper.findComponent(DesktopProbe).exists()).toBe(false)
  })

  it('isMobile=false: renders the desktop stepper', async () => {
    const wrapper = await mountView()
    expect(wrapper.findComponent(DesktopProbe).exists()).toBe(true)
    expect(wrapper.findComponent(MobileProbe).exists()).toBe(false)
  })

  it('bracket mode: bracketLocked=true passed to the stepper', async () => {
    loadTournamentMock.mockResolvedValue(makeClientTournament({ mode: 'bracket' }))
    const wrapper = await mountView()
    expect(getProbe(wrapper).props('bracketLocked')).toBe(true)
  })

  it('championship mode: bracketLocked=false passed to the stepper', async () => {
    loadTournamentMock.mockResolvedValue(makeClientTournament({ mode: 'championship' }))
    const wrapper = await mountView()
    expect(getProbe(wrapper).props('bracketLocked')).toBe(false)
  })

  // <RouterView> wraps every route component in a <Transition mode="out-in">, which
  // only animates a single root node. A second root — a comment kept beside the
  // branches in a dev build is enough — leaves the leave transition pending forever:
  // the page navigated away from never finishes leaving and the next one never mounts.
  it('renders a single root node, whatever branch is shown', async () => {
    const wrapper = await mountView()
    expect(wrapper.vm.$.subTree.type).not.toBe(Fragment)

    loadTournamentMock.mockImplementation(() => new Promise(() => {}))
    const loading = await mountView()
    expect(loading.vm.$.subTree.type).not.toBe(Fragment)
  })

  it('provides the expected MATCH_FORM_KEY context to descendants', async () => {
    const wrapper = await mountView()
    const probe = getProbe(wrapper)
    expect(probe.vm.participants).toEqual([
      { id: 'u1', displayName: 'Alice' },
      { id: 'u2', displayName: 'Bob' },
    ])
    expect(probe.vm.isLoading).toBe(false)
    expect(probe.vm.activeStep).toBe('when')
    expect(probe.vm.tournament?.teamMode).toBe('flex')
  })
})
