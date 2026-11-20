import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { ClientTournamentSummary } from '@skol-arena/shared/types/index'
import TournamentCard from '../TournamentCard.vue'

vi.mock('vue-i18n', async () => (await import('@/test-support/mock-modules')).i18nEchoMock())

function makeSummary(over: Partial<ClientTournamentSummary> = {}): ClientTournamentSummary {
  return {
    id: 't1',
    name: 'Summer Cup',
    mode: 'championship',
    teamMode: 'flex',
    status: 'ongoing',
    startDate: new Date('2026-06-01'),
    endDate: new Date('2026-08-31'),
    participantCount: 12,
    isParticipant: false,
    ...over,
  } as ClientTournamentSummary
}

describe('TournamentCard', () => {
  it('shows name, status and mode', () => {
    const wrapper = mount(TournamentCard, { props: { tournament: makeSummary() } })
    expect(wrapper.text()).toContain('Summer Cup')
    expect(wrapper.text()).toContain('tournamentCard.status.ongoing')
    expect(wrapper.text()).toContain('tournamentCard.mode.championship')
  })

  it('visual accent depending on the mode', () => {
    const ranked = mount(TournamentCard, {
      props: { tournament: makeSummary({ mode: 'ranked' }) },
    })
    expect(ranked.classes()).toContain('mode-ranked')
  })

  it('shows the discipline when present', () => {
    const wrapper = mount(TournamentCard, {
      props: {
        tournament: makeSummary({ discipline: { id: 'd1', name: 'Babyfoot' } }),
      },
    })
    expect(wrapper.text()).toContain('Babyfoot')
  })

  it('emits click with the tournament', async () => {
    const tournament = makeSummary()
    const wrapper = mount(TournamentCard, { props: { tournament } })
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toEqual([[tournament]])
  })

  it('full progress bar for a finished tournament', () => {
    const wrapper = mount(TournamentCard, {
      props: { tournament: makeSummary({ status: 'finished' }) },
    })
    expect(wrapper.find('.progress-bar').attributes('style')).toContain('width: 100%')
    expect(wrapper.text()).toContain('tournamentCard.period.finished')
  })

  it('shows the number of participants', () => {
    const wrapper = mount(TournamentCard, { props: { tournament: makeSummary() } })
    expect(wrapper.text()).toContain('tournamentCard.participants#12')
  })

  it('replaces the dates with the summary once finished', () => {
    const wrapper = mount(TournamentCard, {
      props: { tournament: makeSummary({ status: 'finished' }) },
    })
    expect(wrapper.text()).toContain('tournamentCard.viewResults')
    expect(wrapper.classes()).toContain('mode-finished')
  })

  it('marks participation only on the featured variant', () => {
    const tournament = makeSummary({ isParticipant: true })

    const plain = mount(TournamentCard, { props: { tournament } })
    expect(plain.text()).not.toContain('tournamentCard.youParticipate')

    const featured = mount(TournamentCard, { props: { tournament, variant: 'featured' } })
    expect(featured.text()).toContain('tournamentCard.youParticipate')
  })

  it('switches participation to past tense once the tournament is finished', () => {
    const wrapper = mount(TournamentCard, {
      props: {
        tournament: makeSummary({ isParticipant: true, status: 'finished' }),
        variant: 'featured',
      },
    })
    expect(wrapper.text()).toContain('tournamentCard.youParticipated')
  })
})
