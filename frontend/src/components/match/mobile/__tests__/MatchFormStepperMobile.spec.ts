import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, ref, nextTick } from 'vue'
import type { ClientBaseTournament } from '@skol-arena/shared/types/index'
import { mountWithUi } from '@/test-support/mount'
import {
  MATCH_FORM_KEY,
  type MatchFormContext,
  type MatchFormState,
} from '@/composables/match/match-form.context'
import MatchFormStepperMobile from '../MatchFormStepperMobile.vue'

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

const triggers = { when: vi.fn(), participants: vi.fn(), teams: vi.fn(), composition: vi.fn() }
const stepStub = (name: keyof typeof triggers) =>
  defineComponent({
    name: `${name}Stub`,
    setup(_, { expose }) {
      expose({ triggerNext: async () => triggers[name]() })
      return () => null
    },
  })

interface Vm {
  canSchedule: boolean
  canProceedStep: boolean
  canSubmit: boolean
  isFutureDate: boolean
  goToStepFromParticipants: () => void
  goToStepAfterTeams: () => void
  goToStepAfterComposition: () => void
  goBackFromResult: () => void
  currentStepBack: () => void
  currentStepNext: () => Promise<void>
  submitMatch: () => Promise<void>
}

function mountStepper(ctx: MatchFormContext, props: Record<string, unknown> = {}) {
  const wrapper = mountWithUi(MatchFormStepperMobile, {
    props: { tournamentId: 't1', ...props },
    global: {
      provide: { [MATCH_FORM_KEY as symbol]: ctx },
      stubs: {
        WhenStep: stepStub('when'),
        ParticipantsStep: stepStub('participants'),
        TeamsStep: stepStub('teams'),
        CompositionStep: stepStub('composition'),
        ResultStep: true,
      },
    },
  })
  return wrapper.findComponent(MatchFormStepperMobile).vm as unknown as Vm
}

beforeEach(() => vi.clearAllMocks())

describe('MatchFormStepperMobile — what the footer allows', () => {
  it('lets a flex match be scheduled once two players and their sides are set', () => {
    expect(mountStepper(makeContext()).canSchedule).toBe(true)
    expect(mountStepper(makeContext({ allPlayerIds: ['a'] })).canSchedule).toBe(false)
    expect(
      mountStepper(
        makeContext({
          sides: [
            { position: 1, playerIds: [] },
            { position: 2, playerIds: ['b'] },
          ],
        }),
      ).canSchedule,
    ).toBe(false)
  })

  it('lets a static match be scheduled once both teams are picked', () => {
    const picked = makeContext(
      {
        sides: [
          { position: 1, teamId: 'x' },
          { position: 2, teamId: 'y' },
        ],
      },
      { teamMode: 'static' },
    )
    expect(mountStepper(picked).canSchedule).toBe(true)
    const partial = makeContext(
      { sides: [{ position: 1, teamId: 'x' }, { position: 2 }] },
      { teamMode: 'static' },
    )
    expect(mountStepper(partial).canSchedule).toBe(false)
  })

  it('checks each step before letting the user move on', async () => {
    const ctx = makeContext({ allPlayerIds: ['a'] })
    const vm = mountStepper(ctx)
    ctx.activeStep.value = 'when'
    await nextTick()
    expect(vm.canProceedStep).toBe(true)
    ctx.formState.value.playedAt = null
    await nextTick()
    expect(vm.canProceedStep).toBe(false)

    ctx.activeStep.value = 'participants'
    await nextTick()
    expect(vm.canProceedStep).toBe(false)
    ctx.formState.value.allPlayerIds = ['a', 'b']
    await nextTick()
    expect(vm.canProceedStep).toBe(true)

    ctx.activeStep.value = 'composition'
    ctx.formState.value.sides = [
      { position: 1, playerIds: [] },
      { position: 2, playerIds: ['b'] },
    ]
    await nextTick()
    expect(vm.canProceedStep).toBe(false)
    ctx.formState.value.sides = [
      { position: 1, playerIds: ['a'] },
      { position: 2, playerIds: ['b'] },
    ]
    await nextTick()
    expect(vm.canProceedStep).toBe(true)

    ctx.activeStep.value = 'teams'
    ctx.formState.value.sides = [{ position: 1, teamId: 'x' }, { position: 2 }]
    await nextTick()
    expect(vm.canProceedStep).toBe(false)

    ctx.activeStep.value = 'result'
    await nextTick()
    expect(vm.canProceedStep).toBe(true)
  })

  it('rejects a date outside the tournament window', async () => {
    const ctx = makeContext({}, {
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
    } as never)
    const vm = mountStepper(ctx)
    expect(vm.canProceedStep).toBe(false)
  })

  it('needs a winner, and scores within bounds when scoring is on', async () => {
    const ctx = makeContext({ winnerPosition: null }, { minScore: 0, maxScore: 5 })
    const vm = mountStepper(ctx)
    expect(vm.canSubmit).toBe(false)
    ctx.formState.value.winnerPosition = 1
    ctx.formState.value.scorePerSide = { 1: 5, 2: 0 }
    await nextTick()
    expect(vm.canSubmit).toBe(true)
    ctx.formState.value.scorePerSide = { 1: 6, 2: 0 }
    await nextTick()
    expect(vm.canSubmit).toBe(false)
  })

  it('accepts any score when scoring is off, and unbounded scores otherwise', () => {
    expect(
      mountStepper(
        makeContext({ scorePerSide: { 1: 999, 2: 0 } }, { scoreEnabled: false, maxScore: 5 }),
      ).canSubmit,
    ).toBe(true)
    expect(
      mountStepper(
        makeContext({ scorePerSide: { 1: 999, 2: 0 } }, { minScore: null, maxScore: null }),
      ).canSubmit,
    ).toBe(true)
  })
})

describe('MatchFormStepperMobile — navigation', () => {
  it('stays on the step for a future match so it can be scheduled from the footer', () => {
    const ctx = makeContext({ playedAt: FUTURE })
    ctx.activeStep.value = 'participants'
    const vm = mountStepper(ctx)
    vm.goToStepFromParticipants()
    expect(ctx.activeStep.value).toBe('participants')
    vm.goToStepAfterTeams()
    vm.goToStepAfterComposition()
    expect(ctx.activeStep.value).toBe('participants')
    expect(createMatchWithNavigation).not.toHaveBeenCalled()
  })

  it('moves on to the result for a past match, building the 1v1 sides', () => {
    const ctx = makeContext({ allPlayerIds: ['x', 'y'], sides: [] })
    const vm = mountStepper(ctx)
    vm.goToStepFromParticipants()
    expect(ctx.formState.value.sides).toEqual([
      { position: 1, playerIds: ['x'] },
      { position: 2, playerIds: ['y'] },
    ])
    expect(ctx.activeStep.value).toBe('result')

    ctx.activeStep.value = 'teams'
    vm.goToStepAfterTeams()
    expect(ctx.activeStep.value).toBe('result')
    ctx.activeStep.value = 'composition'
    vm.goToStepAfterComposition()
    expect(ctx.activeStep.value).toBe('result')
  })

  it('routes to composition for a bigger match', () => {
    const ctx = makeContext({ allPlayerIds: ['a', 'b', 'c'] })
    mountStepper(ctx).goToStepFromParticipants()
    expect(ctx.activeStep.value).toBe('composition')
  })

  it.each([
    ['participants', 'when'],
    ['teams', 'when'],
    ['composition', 'participants'],
    ['result', 'participants'],
  ])('steps back from %s to %s', (from, to) => {
    const ctx = makeContext()
    ctx.activeStep.value = from
    mountStepper(ctx).currentStepBack()
    expect(ctx.activeStep.value).toBe(to)
  })

  it('leaves a correction page and steps back through the bracket and static flows', () => {
    mountStepper(makeContext(), { resultOnly: true }).goBackFromResult()
    expect(back).toHaveBeenCalled()

    const bracket = makeContext()
    bracket.activeStep.value = 'result'
    mountStepper(bracket, { bracketLocked: true }).goBackFromResult()
    expect(bracket.activeStep.value).toBe('when')

    const staticCtx = makeContext({}, { teamMode: 'static' })
    mountStepper(staticCtx).goBackFromResult()
    expect(staticCtx.activeStep.value).toBe('teams')

    const composed = makeContext({ allPlayerIds: ['a', 'b', 'c'] })
    mountStepper(composed).goBackFromResult()
    expect(composed.activeStep.value).toBe('composition')
  })

  it('does nothing when stepping back from the first step', () => {
    const ctx = makeContext()
    mountStepper(ctx).currentStepBack()
    expect(ctx.activeStep.value).toBe('when')
  })

  it.each(['when', 'participants', 'teams', 'composition'] as const)(
    'asks the %s step to advance',
    async (step) => {
      const ctx = makeContext()
      ctx.activeStep.value = step
      const vm = mountStepper(ctx)
      await nextTick()
      await vm.currentStepNext()
      expect(triggers[step]).toHaveBeenCalledTimes(1)
    },
  )

  it('does not advance from the result step', async () => {
    const ctx = makeContext()
    ctx.activeStep.value = 'result'
    await mountStepper(ctx).currentStepNext()
    for (const trigger of Object.values(triggers)) expect(trigger).not.toHaveBeenCalled()
  })
})

describe('MatchFormStepperMobile — submitting', () => {
  it('reports a played match', async () => {
    await mountStepper(makeContext()).submitMatch()
    expect(createMatchWithNavigation).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'reported',
        scoreA: 3,
        scoreB: 1,
        winnerPosition: 1,
        outcomeTypeId: 'ot',
      }),
      't1',
      'championship',
    )
  })

  it('schedules a future match, and turns a draw into no winner', async () => {
    await mountStepper(makeContext({ playedAt: FUTURE })).submitMatch()
    expect(createMatchWithNavigation).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'scheduled', scoreA: 0, winnerPosition: null }),
      't1',
      'championship',
    )
    await mountStepper(
      makeContext({
        winnerPosition: 0,
        scorePerSide: {},
        outcomeTypeId: null,
        outcomeReasonId: null,
      }),
    ).submitMatch()
    expect(createMatchWithNavigation).toHaveBeenLastCalledWith(
      expect.objectContaining({ winnerPosition: null, scoreB: 0, outcomeReasonId: undefined }),
      't1',
      'championship',
    )
  })

  it('updates an existing match', async () => {
    await mountStepper(makeContext(), { matchId: 'm1' }).submitMatch()
    expect(updateMatchWithNavigation).toHaveBeenCalledWith(
      'm1',
      expect.objectContaining({ status: 'reported' }),
      't1',
      'championship',
    )
    expect(createMatchWithNavigation).not.toHaveBeenCalled()
  })
})
