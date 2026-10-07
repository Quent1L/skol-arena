import { describe, it, expect, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { nextTick, ref } from 'vue'

import fr from '@/i18n/messages/fr.json'
import { mountWithPrime } from '@/test-support/mount'
import type { ClientMatchDetail, MatchStatus } from '@skol-arena/shared/types/index'
// Static import: vi.mock calls are hoisted above it, and importing inside each test made
// the first one pay the module-resolution cost and blow the default timeout.
import MatchDetailView from '../MatchDetailView.vue'

const match = ref<ClientMatchDetail | null>(null)

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('vue-router')
  return {
    ...actual,
    useRoute: () => ({ params: { id: 'm-1' } }),
    useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  }
})

vi.mock('@/composables/match/match.service', () => ({
  useMatchService: () => ({
    getMatch: vi.fn(async () => match.value),
    respondToMatch: vi.fn(),
    finalizeMatch: vi.fn(),
    cancelMatch: vi.fn(),
    subscribeToMatchUpdates: () => () => undefined,
  }),
}))

vi.mock('@/composables/match/match-message.service', () => ({
  useMatchMessageService: () => ({
    messages: ref([]),
    loading: ref(false),
    posting: ref(false),
    load: vi.fn(),
    post: vi.fn(),
    subscribe: () => () => undefined,
  }),
}))

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({ appUser: ref({ id: 'p1', role: 'player', displayName: 'Toto' }) }),
}))

vi.mock('@/composables/ranked/ranked.service', () => ({
  useRankedService: () => ({ tiers: ref([]), loadTiers: vi.fn() }),
}))

vi.mock('@/composables/notification/notification.socket', () => ({
  onWsEvent: () => () => undefined,
}))

function makeMatch(status: MatchStatus, over: Partial<ClientMatchDetail> = {}): ClientMatchDetail {
  const side = (position: number, playerId: string, displayName: string) => ({
    position,
    score: position === 1 ? 3 : 1,
    pointsAwarded: 0,
    isWinner: position === 1,
    entryId: `e-${position}`,
    entryName: null,
    teamId: null,
    players: [{ id: playerId, displayName, shortName: displayName, effectivePointsAwarded: 3 }],
  })

  return {
    id: 'm-1',
    tournamentId: 't-1',
    status,
    playedAt: new Date('2026-06-01T14:00:00Z'),
    createdAt: new Date('2026-06-01T14:00:00Z'),
    createdBy: 'p2',
    confirmations: [],
    tournament: {
      id: 't-1',
      name: 'Coupe du Vendredi',
      mode: 'championship',
      teamMode: 'flex',
      scoreEnabled: true,
      status: 'ongoing',
    },
    sides: [side(1, 'p1', 'Toto'), side(2, 'p2', 'Titi')],
    result: { reportedBy: 'p2', reportedAt: new Date('2026-06-01T14:30:00Z') },
    ...over,
  } as ClientMatchDetail
}

async function mountView(detail: ClientMatchDetail) {
  match.value = detail
  const i18n = createI18n({ legacy: false, locale: 'fr', fallbackLocale: 'fr', messages: { fr } })
  const wrapper = mountWithPrime(MatchDetailView, { global: { plugins: [i18n] } })
  await nextTick()
  await nextTick()
  await nextTick()
  return wrapper
}

describe('MatchDetailView (render smoke)', () => {
  it('renders the scoreboard of a finalized championship match', async () => {
    const wrapper = await mountView(
      makeMatch('finalized', {
        result: {
          reportedBy: 'p2',
          reportedAt: new Date('2026-06-01T14:30:00Z'),
          finalizedAt: new Date('2026-06-01T15:00:00Z'),
          finalizationReason: 'consensus',
        },
      } as Partial<ClientMatchDetail>),
    )

    const text = wrapper.text()
    expect(text).toContain('Coupe du Vendredi')
    expect(text).toContain('Toto')
    expect(text).toContain('Titi')
    expect(text).toContain(fr.matchStatus.finalized)
    expect(text).toContain(fr.tournamentCard.mode.championship)
    // The meta strip stacks label over value, so the trailing colon baked into the
    // i18n string is stripped
    expect(fr.matchDetailView.matchDate).toMatch(/\s:\s*$/)
    expect(text).toContain(fr.matchDetailView.matchDate.replace(/\s*:\s*$/, ''))
    expect(text).not.toContain(fr.matchDetailView.matchDate)
    // Labels resolved rather than echoing raw i18n keys
    expect(text).not.toMatch(/matchDetailView\./)
  })

  it('gives the score its own row on phones and the middle column from sm:', async () => {
    const wrapper = await mountView(makeMatch('reported'))

    const scoreBlock = wrapper.find('.col-span-2')
    expect(scoreBlock.exists()).toBe(true)
    expect(scoreBlock.classes()).toContain('order-first')
    expect(scoreBlock.classes()).toContain('sm:col-span-1')
    expect(scoreBlock.classes()).toContain('flex')
    expect(scoreBlock.classes()).not.toContain('hidden')
    expect(scoreBlock.text()).toContain('3')
  })

  it('falls back to VS when the tournament does not track scores', async () => {
    const wrapper = await mountView(
      makeMatch('scheduled', {
        tournament: {
          id: 't-1',
          name: 'Coupe du Vendredi',
          mode: 'championship',
          teamMode: 'flex',
          scoreEnabled: false,
          status: 'ongoing',
        },
      } as Partial<ClientMatchDetail>),
    )

    expect(wrapper.text()).toContain(fr.matchCard.vs)
    // A full-width row on a phone for two letters between two names it already
    // separates: the fallback earns the middle column, not a row of its own
    const vsBlock = wrapper.find('.col-span-2')
    expect(vsBlock.classes()).toContain('hidden')
    expect(vsBlock.classes()).toContain('sm:flex')
  })

  it('marks each player validation state in the scoreboard while a round is open', async () => {
    const wrapper = await mountView(
      makeMatch('reported', {
        confirmations: [
          {
            id: 'c-1',
            matchId: 'm-1',
            playerId: 'p2',
            isConfirmed: true,
            isContested: false,
            contestationReason: null,
            sidePosition: 2,
            isPostFinalization: false,
          },
        ],
      } as Partial<ClientMatchDetail>),
    )

    // One marker per participant, and only the reporter reads as accepted
    expect(wrapper.findAll('.side-panel .fa-circle-check')).toHaveLength(1)
    expect(wrapper.findAll('.side-panel .fa-hourglass-half')).toHaveLength(1)
    expect(wrapper.text()).toContain(fr.matchConfirmation.tagAccepted)
    expect(wrapper.text()).toContain(fr.matchConfirmation.tagPending)
    // The panel keeps the aggregate only
    expect(wrapper.text()).toContain('1/2')
  })

  it('reserves no room for validation markers once the match is settled', async () => {
    const wrapper = await mountView(
      makeMatch('finalized', {
        result: {
          reportedBy: 'p2',
          reportedAt: new Date('2026-06-01T14:30:00Z'),
          finalizedAt: new Date('2026-06-01T15:00:00Z'),
          finalizationReason: 'consensus',
        },
      } as Partial<ClientMatchDetail>),
    )

    expect(wrapper.findAll('.side-panel .fa-circle-check')).toHaveLength(0)
    expect(wrapper.findAll('.side-panel .fa-hourglass-half')).toHaveLength(0)
    expect(wrapper.text()).not.toContain(fr.matchConfirmation.tagPending)
  })

  it('names the declared winner on a reported match but withholds the points', async () => {
    const wrapper = await mountView(makeMatch('reported'))

    expect(wrapper.text()).toContain(fr.matchDetailView.declaredWinner)
    expect(wrapper.findAll('.crown')).toHaveLength(1)
    // The entry timestamp moved from MatchConfirmation to the meta strip
    expect(wrapper.text()).toContain(fr.matchDetailView.reportedAt.replace(/\s*:\s*$/, ''))
    // Points are only awarded at finalization, so no delta pill yet
    expect(wrapper.text()).not.toContain('+3')
  })

  it('swaps the declared-winner pill for the awarded points once finalized', async () => {
    const wrapper = await mountView(
      makeMatch('finalized', {
        result: {
          reportedBy: 'p2',
          reportedAt: new Date('2026-06-01T14:30:00Z'),
          finalizedAt: new Date('2026-06-01T15:00:00Z'),
          finalizationReason: 'consensus',
        },
      } as Partial<ClientMatchDetail>),
    )

    expect(wrapper.text()).not.toContain(fr.matchDetailView.declaredWinner)
    expect(wrapper.text()).toContain('+3')
  })

  it('shows no winner on a scheduled match', async () => {
    const wrapper = await mountView(makeMatch('scheduled'))

    expect(wrapper.text()).not.toContain(fr.matchDetailView.declaredWinner)
    expect(wrapper.findAll('.crown')).toHaveLength(0)
  })

  it('shows the confirmation panel on a reported match a participant can answer', async () => {
    const wrapper = await mountView(makeMatch('reported'))

    expect(wrapper.text()).toContain(fr.matchConfirmation.acceptBtn)
    expect(wrapper.text()).toContain(fr.matchConfirmation.disputeBtn)
  })

  it('flags an open contestation in the meta strip', async () => {
    const wrapper = await mountView(
      makeMatch('finalized', {
        confirmations: [
          {
            id: 'conf-1',
            matchId: 'm-1',
            playerId: 'p1',
            isConfirmed: false,
            isContested: true,
            contestationReason: 'le score est faux',
            sidePosition: 1,
            isPostFinalization: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            player: { id: 'p1', displayName: 'Toto' },
          },
        ],
      } as Partial<ClientMatchDetail>),
    )

    expect(wrapper.text()).toContain(fr.matchDetailView.postDisputedBy)
    expect(wrapper.text()).toContain('Toto')
  })
})

describe('MatchDetailView (finalized result correction)', () => {
  const HOUR = 60 * 60 * 1000
  const selfValidated = (hoursAgo: number, reportedBy = 'p1') =>
    makeMatch('finalized', {
      result: {
        reportedBy,
        reportedAt: new Date(Date.now() - hoursAgo * HOUR),
        finalizedAt: new Date(Date.now() - hoursAgo * HOUR),
        finalizationReason: 'trust_score',
      },
    } as Partial<ClientMatchDetail>)

  const actionLabels = (wrapper: Awaited<ReturnType<typeof mountView>>) =>
    ((wrapper.vm as unknown as { actionItems: { label: string }[] }).actionItems ?? []).map(
      (i) => i.label,
    )

  it('offers the author to correct and cancel a result they just self-validated', async () => {
    const labels = actionLabels(await mountView(selfValidated(1)))
    expect(labels).toContain(fr.matchDetailView.correctResult)
    expect(labels).toContain(fr.matchDetailView.cancelMatch)
  })

  it('withdraws both once the author window has closed', async () => {
    const labels = actionLabels(await mountView(selfValidated(49)))
    expect(labels).not.toContain(fr.matchDetailView.correctResult)
    expect(labels).not.toContain(fr.matchDetailView.cancelMatch)
  })

  it("stays open past 48h while the opponent contests, not when the author contests themselves", async () => {
    const contested = (playerId: string) => {
      const m = selfValidated(60)
      m.confirmations = [{ playerId, isContested: true, isPostFinalization: true } as never]
      return m
    }
    expect(actionLabels(await mountView(contested('p2')))).toContain(fr.matchDetailView.correctResult)
    expect(actionLabels(await mountView(contested('p1')))).not.toContain(
      fr.matchDetailView.correctResult,
    )
  })

  it('never offers it to the opponent', async () => {
    const labels = actionLabels(await mountView(selfValidated(1, 'p2')))
    expect(labels).not.toContain(fr.matchDetailView.correctResult)
  })
})
