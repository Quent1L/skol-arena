import { describe, it, expect } from 'vitest'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'

import fr from '@/i18n/messages/fr.json'
import { mountWithPlugins } from '@/test-support/mount'
import MatchConfirmation from '../MatchConfirmation.vue'
import type { ClientMatchDetail, MatchDetailConfirmation, MatchStatus } from '@skol-arena/shared/types/index'

function makeConfirmation(over: Partial<MatchDetailConfirmation> = {}): MatchDetailConfirmation {
  return {
    id: 'conf-1',
    matchId: 'm-1',
    playerId: 'p1',
    isConfirmed: false,
    isContested: true,
    contestationReason: 'le score est faux',
    sidePosition: 1,
    isPostFinalization: false,
    createdAt: new Date('2026-06-01T15:00:00Z'),
    updatedAt: new Date('2026-06-01T15:00:00Z'),
    player: { id: 'p1', displayName: 'Toto' },
    ...over,
  }
}

function makeFinalizedMatch(
  confirmations: MatchDetailConfirmation[],
  over: { finalizedAt?: Date; finalizationReason?: string; validationMode?: string } = {},
): ClientMatchDetail {
  const match = makeMatch('finalized', confirmations)
  return {
    ...match,
    tournament: { validationMode: over.validationMode ?? 'none' },
    result: {
      ...match.result,
      finalizedAt: over.finalizedAt ?? new Date(Date.now() - 60 * 60 * 1000),
      finalizationReason: over.finalizationReason ?? 'auto_validation',
    },
  } as ClientMatchDetail
}

function makeMatch(status: MatchStatus, confirmations: MatchDetailConfirmation[]): ClientMatchDetail {
  const side = (position: number, playerId: string, displayName: string) => ({
    position,
    score: position === 1 ? 3 : 1,
    pointsAwarded: 0,
    isWinner: position === 1,
    entryId: `e-${position}`,
    entryName: null,
    teamId: null,
    players: [{ id: playerId, displayName }],
  })

  return {
    id: 'm-1',
    tournamentId: 't-1',
    status,
    playedAt: new Date('2026-06-01T14:00:00Z'),
    createdAt: new Date('2026-06-01T14:00:00Z'),
    createdBy: 'p2',
    confirmations,
    sides: [side(1, 'p1', 'Toto'), side(2, 'p2', 'Titi')],
    result: { reportedBy: 'p2', reportedAt: new Date('2026-06-01T14:30:00Z') },
  } as ClientMatchDetail
}

function mountConfirmation(match: ClientMatchDetail, currentUserId = 'p1') {
  const i18n = createI18n({ legacy: false, locale: 'fr', fallbackLocale: 'fr', messages: { fr } })
  return mountWithPlugins(MatchConfirmation, {
    props: { match, currentUserId },
    global: { plugins: [i18n] },
  })
}

const withdrawLabel = fr.matchConfirmation.withdrawDisputeBtn

describe('MatchConfirmation', () => {
  it('offers the contester a way out once the match is disputed', async () => {
    const wrapper = mountConfirmation(makeMatch('disputed', [makeConfirmation()]))
    await nextTick()

    expect(wrapper.text()).toContain(withdrawLabel)
  })

  it('does not offer the withdrawal to a player who accepted', async () => {
    const wrapper = mountConfirmation(
      makeMatch('disputed', [makeConfirmation({ isConfirmed: true, isContested: false })]),
    )
    await nextTick()

    expect(wrapper.text()).not.toContain(withdrawLabel)
  })

  it('emits an agree response when the contester confirms the withdrawal', async () => {
    const wrapper = mountConfirmation(makeMatch('disputed', [makeConfirmation()]))
    await nextTick()

    const withdrawBtn = wrapper.findAll('button').find((b) => b.text().includes(withdrawLabel))
    await withdrawBtn!.trigger('click')
    await nextTick()

    // The dialog teleports to the body, so reach for its submit button there
    const submit = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes(fr.matchConfirmation.confirmAcceptanceBtn),
    )
    submit!.click()
    await nextTick()

    expect(wrapper.emitted('respond')).toEqual([[{ type: 'agree', reason: undefined }]])
  })

  it('lets a player contest a result finalized without them', async () => {
    const wrapper = mountConfirmation(makeFinalizedMatch([]))
    await nextTick()

    expect(wrapper.text()).toContain(fr.matchConfirmation.postDisputeBtn)
  })

  it('does not offer the contestation to the author of the entry', async () => {
    const wrapper = mountConfirmation(makeFinalizedMatch([]), 'p2')
    await nextTick()

    expect(wrapper.text()).not.toContain(fr.matchConfirmation.postDisputeBtn)
  })

  it('closes the panel once the contestation window has expired', async () => {
    const wrapper = mountConfirmation(
      makeFinalizedMatch([], { finalizedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) }),
    )
    await nextTick()

    expect(wrapper.text()).not.toContain(fr.matchConfirmation.postDisputeBtn)
  })

  it('closes the panel on a result an organizer already arbitrated', async () => {
    const wrapper = mountConfirmation(
      makeFinalizedMatch([], { finalizationReason: 'admin_override' }),
    )
    await nextTick()

    expect(wrapper.text()).not.toContain(fr.matchConfirmation.postDisputeBtn)
  })

  it('emits a dispute response with its reason on a finalized match', async () => {
    const wrapper = mountConfirmation(makeFinalizedMatch([]))
    await nextTick()

    const disputeBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes(fr.matchConfirmation.postDisputeBtn))
    await disputeBtn!.trigger('click')
    await nextTick()

    const textarea = document.body.querySelector('textarea')!
    textarea.value = 'le score est inversé'
    textarea.dispatchEvent(new Event('input'))
    await nextTick()

    const submit = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes(fr.matchConfirmation.submitDisputeBtn),
    )
    submit!.click()
    await nextTick()

    expect(wrapper.emitted('respond')).toEqual([
      [{ type: 'dispute', reason: 'le score est inversé' }],
    ])
  })

  it('offers a contester of a finalized result the way back', async () => {
    const wrapper = mountConfirmation(
      makeFinalizedMatch([makeConfirmation({ isPostFinalization: true })]),
    )
    await nextTick()

    expect(wrapper.text()).toContain(fr.matchConfirmation.withdrawPostDisputeBtn)
    expect(wrapper.text()).not.toContain(fr.matchConfirmation.postDisputeBtn)

    const withdrawBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes(fr.matchConfirmation.withdrawPostDisputeBtn))
    await withdrawBtn!.trigger('click')
    await nextTick()

    const submit = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes(fr.matchConfirmation.confirmAcceptanceBtn),
    )
    submit!.click()
    await nextTick()

    expect(wrapper.emitted('respond')).toEqual([[{ type: 'agree', reason: undefined }]])
  })
})
