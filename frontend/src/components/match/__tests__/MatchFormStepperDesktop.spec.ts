import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref, nextTick } from 'vue'
import type { ClientBaseTournament } from '@skol-arena/shared/types/index'
import { mountWithUi } from '@/test-support/mount'
import {
  MATCH_FORM_KEY,
  type MatchFormContext,
  type MatchFormState,
} from '@/composables/match/match-form.context'
import MatchFormStepperDesktop from '../MatchFormStepperDesktop.vue'

vi.mock('vue-i18n', async () => (await import('@/test-support/mock-modules')).i18nEchoMock())
vi.mock('@/config/ApiConfig', async () =>
  (await import('@/test-support/mock-modules')).apiConfigMock(),
)

const createMatchWithNavigation = vi.fn(async () => {})
const updateMatchWithNavigation = vi.fn(async () => {})
vi.mock('@/composables/match/match.service', () => ({
  useMatchService: () => ({
    loading: ref(false),
    createMatchWithNavigation,
    updateMatchWithNavigation,
  }),
}))

const back = vi.fn()
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRouter: () => ({ back, push: vi.fn() }),
}))

const PAST = new Date('2020-01-01T10:00:00Z')
const FUTURE = new Date(Date.now() + 7 * 86_400_000)

function makeContext(
  overrides: Partial<MatchFormState> = {},
  tournament: Partial<ClientBaseTournament> = {},
) {
  const ctx: MatchFormContext = {
    formState: ref<MatchFormState>({
      playedAt: PAST,
      sides: [
        { position: 1, playerIds: ['a'] },
        { position: 2, playerIds: ['b'] },
      ],
      allPlayerIds: ['a', 'b'],
      winnerPosition: 1,
      scorePerSide: { 1: 3, 2: 1 },
      outcomeTypeId: 'ot',
      outcomeReasonId: 'or',
      ...overrides,
    }),
    activeStep: ref('when'),
    tournament: ref({
      id: 't1',
      mode: 'championship',
      teamMode: 'flex',
      scoreEnabled: true,
      ...tournament,
    } as ClientBaseTournament),
    playersMap: ref({}),
    teams: ref([]),
    participants: ref([]),
    outcomeTypes: ref([]),
    outcomeReasons: ref([]),
    scoreInstructions: ref(null),
    isLoading: ref(false),
    standings: ref(null),
  }
  return ctx
}

interface Vm {
  isEditMode: boolean
  isFlexMode: boolean
  isStaticMode: boolean
  isFutureDate: boolean
  needsComposition: boolean
  visibleSteps: { value: string }[]
  activeStepIndex: number
  nextStepAfterWhen: string
  isLastStepBeforeResult: boolean
  goToStep: (from: string, to: string) => void
  goToStepFromParticipants: () => void
  goToStepAfterTeams: () => void
  goToStepAfterComposition: () => void
  goBackFromResult: () => void
  submitMatch: () => Promise<void>
}

function mountStepper(ctx: MatchFormContext, props: Record<string, unknown> = {}) {
  const wrapper = mountWithUi(MatchFormStepperDesktop, {
    props: { tournamentId: 't1', ...props },
    global: {
      provide: { [MATCH_FORM_KEY as symbol]: ctx },
      stubs: {
        WhenStep: true,
        ParticipantsStep: true,
        TeamsStep: true,
        CompositionStep: true,
        ResultStep: true,
      },
    },
  })
  return wrapper.findComponent(MatchFormStepperDesktop).vm as unknown as Vm
}

beforeEach(() => vi.clearAllMocks())

describe('MatchFormStepperDesktop — steps', () => {
  it('walks when → participants → result for a 1v1 in flex mode', () => {
    const vm = mountStepper(makeContext())
    expect(vm.visibleSteps.map((s) => s.value)).toEqual(['when', 'participants', 'result'])
    expect(vm.needsComposition).toBe(false)
    expect(vm.nextStepAfterWhen).toBe('participants')
    expect(vm.activeStepIndex).toBe(0)
  })

  it('adds a composition step beyond two players', () => {
    const vm = mountStepper(makeContext({ allPlayerIds: ['a', 'b', 'c', 'd'] }))
    expect(vm.visibleSteps.map((s) => s.value)).toEqual([
      'when',
      'participants',
      'composition',
      'result',
    ])
    expect(vm.needsComposition).toBe(true)
  })

  it('uses a teams step in static mode', () => {
    const vm = mountStepper(makeContext({}, { teamMode: 'static' }))
    expect(vm.isStaticMode).toBe(true)
    expect(vm.isFlexMode).toBe(false)
    expect(vm.visibleSteps.map((s) => s.value)).toEqual(['when', 'teams', 'result'])
    expect(vm.nextStepAfterWhen).toBe('teams')
  })

  it('drops the result step for a match scheduled in the future', () => {
    const vm = mountStepper(makeContext({ playedAt: FUTURE }))
    expect(vm.isFutureDate).toBe(true)
    expect(vm.visibleSteps.map((s) => s.value)).toEqual(['when', 'participants'])
  })

  it('shows only when and result for a bracket match, and only the result for a correction', () => {
    const bracket = mountStepper(makeContext(), { bracketLocked: true })
    expect(bracket.visibleSteps.map((s) => s.value)).toEqual(['when', 'result'])
    expect(bracket.nextStepAfterWhen).toBe('result')
    const correction = mountStepper(makeContext(), { resultOnly: true })
    expect(correction.visibleSteps.map((s) => s.value)).toEqual(['result'])
  })

  it('knows which step precedes the result', async () => {
    const ctx = makeContext({ allPlayerIds: ['a', 'b', 'c'] })
    const vm = mountStepper(ctx)
    ctx.activeStep.value = 'composition'
    await nextTick()
    expect(vm.isLastStepBeforeResult).toBe(true)
    ctx.activeStep.value = 'participants'
    await nextTick()
    expect(vm.isLastStepBeforeResult).toBe(false)

    const staticCtx = makeContext({}, { teamMode: 'static' })
    const staticVm = mountStepper(staticCtx)
    staticCtx.activeStep.value = 'teams'
    await nextTick()
    expect(staticVm.isLastStepBeforeResult).toBe(true)

    const bracketCtx = makeContext()
    const bracketVm = mountStepper(bracketCtx, { bracketLocked: true })
    expect(bracketVm.isLastStepBeforeResult).toBe(true)
  })

  it('refuses to leave the first step without a date', () => {
    const ctx = makeContext({ playedAt: null })
    const vm = mountStepper(ctx)
    vm.goToStep('when', 'participants')
    expect(ctx.activeStep.value).toBe('when')
    ctx.formState.value.playedAt = PAST
    vm.goToStep('when', 'participants')
    expect(ctx.activeStep.value).toBe('participants')
  })
})

describe('MatchFormStepperDesktop — navigation', () => {
  it('builds the two sides of a 1v1 and goes to the result', () => {
    const ctx = makeContext({ allPlayerIds: ['x', 'y'], sides: [] })
    const vm = mountStepper(ctx)
    vm.goToStepFromParticipants()
    expect(ctx.formState.value.sides).toEqual([
      { position: 1, playerIds: ['x'] },
      { position: 2, playerIds: ['y'] },
    ])
    expect(ctx.activeStep.value).toBe('result')
  })

  it('goes to the composition step when more than two players are in', () => {
    const ctx = makeContext({ allPlayerIds: ['a', 'b', 'c'] })
    mountStepper(ctx).goToStepFromParticipants()
    expect(ctx.activeStep.value).toBe('composition')
  })

  it('submits straight away from participants, teams and composition when the match is in the future', async () => {
    for (const go of [
      'goToStepFromParticipants',
      'goToStepAfterTeams',
      'goToStepAfterComposition',
    ] as const) {
      createMatchWithNavigation.mockClear()
      const ctx = makeContext({ playedAt: FUTURE })
      mountStepper(ctx)[go]()
      await flushPromises()
      expect(createMatchWithNavigation).toHaveBeenCalledTimes(1)
    }
  })

  it('goes to the result after teams and composition for a past match', () => {
    const ctx = makeContext()
    const vm = mountStepper(ctx)
    vm.goToStepAfterTeams()
    expect(ctx.activeStep.value).toBe('result')
    ctx.activeStep.value = 'composition'
    vm.goToStepAfterComposition()
    expect(ctx.activeStep.value).toBe('result')
  })

  it.each([
    ['flex 1v1', {}, {}, 'participants'],
    ['composition', { allPlayerIds: ['a', 'b', 'c'] }, {}, 'composition'],
    ['bracket', {}, { bracketLocked: true }, 'when'],
  ] as const)(
    'goes back from the result to the right step (%s)',
    (_label, state, props, expected) => {
      const ctx = makeContext(state as Partial<MatchFormState>)
      ctx.activeStep.value = 'result'
      mountStepper(ctx, props).goBackFromResult()
      expect(ctx.activeStep.value).toBe(expected)
    },
  )

  it('goes back to the teams step in static mode, and leaves the page on a correction', () => {
    const staticCtx = makeContext({}, { teamMode: 'static' })
    mountStepper(staticCtx).goBackFromResult()
    expect(staticCtx.activeStep.value).toBe('teams')

    mountStepper(makeContext(), { resultOnly: true }).goBackFromResult()
    expect(back).toHaveBeenCalled()
  })
})

describe('MatchFormStepperDesktop — submitting', () => {
  it('reports a played match with its scores, winner and outcome', async () => {
    const vm = mountStepper(makeContext())
    await vm.submitMatch()
    expect(createMatchWithNavigation).toHaveBeenCalledWith(
      expect.objectContaining({
        tournamentId: 't1',
        status: 'reported',
        scoreA: 3,
        scoreB: 1,
        winnerPosition: 1,
        outcomeTypeId: 'ot',
        outcomeReasonId: 'or',
      }),
      't1',
      'championship',
    )
  })

  it('schedules a future match without a result', async () => {
    await mountStepper(makeContext({ playedAt: FUTURE })).submitMatch()
    expect(createMatchWithNavigation).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'scheduled',
        scoreA: 0,
        scoreB: 0,
        winnerPosition: null,
        outcomeTypeId: undefined,
      }),
      't1',
      'championship',
    )
  })

  it('turns a draw (winner 0) into no winner and fills in missing scores', async () => {
    await mountStepper(
      makeContext({ winnerPosition: 0, scorePerSide: {}, outcomeTypeId: null }),
    ).submitMatch()
    expect(createMatchWithNavigation).toHaveBeenCalledWith(
      expect.objectContaining({
        winnerPosition: null,
        scoreA: 0,
        scoreB: 0,
        outcomeTypeId: undefined,
      }),
      't1',
      'championship',
    )
  })

  it('updates an existing match instead of creating one', async () => {
    const vm = mountStepper(makeContext(), { matchId: 'm1' })
    expect(vm.isEditMode).toBe(true)
    await vm.submitMatch()
    expect(createMatchWithNavigation).not.toHaveBeenCalled()
    expect(updateMatchWithNavigation).toHaveBeenCalledWith(
      'm1',
      expect.objectContaining({ status: 'reported', scoreA: 3 }),
      't1',
      'championship',
    )
  })
})
