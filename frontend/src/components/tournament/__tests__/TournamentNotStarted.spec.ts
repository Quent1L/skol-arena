import { describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { mountWithUi } from '@/test-support/mount'
import { makeTournament } from '@/test-support/factories'
import TournamentNotStarted from '../TournamentNotStarted.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string>) =>
      `${key} ${Object.values(params ?? {}).join(' ')}`,
    locale: { value: 'fr' },
  }),
  createI18n: () => ({ global: { t: (key: string) => key }, install: () => {} }),
}))

const store = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
vi.mock('@/stores/tournamentDetail.store', () => ({ useTournamentDetailStore: () => store.value }))

function mountFor(state: { isParticipant: boolean; canJoinTournament: boolean }) {
  const joinTournament = vi.fn()
  store.value = reactive({
    tournament: makeTournament({
      startDate: new Date(2026, 11, 1) as unknown as string,
      endDate: new Date(2027, 1, 28) as unknown as string,
    }),
    isAuthenticated: true,
    joining: false,
    joinTournament,
    ...state,
  })
  return { wrapper: mountWithUi(TournamentNotStarted), joinTournament }
}

describe('TournamentNotStarted', () => {
  it('says when it runs and lets a visitor join', async () => {
    const { wrapper, joinTournament } = mountFor({ isParticipant: false, canJoinTournament: true })
    expect(wrapper.text()).toContain('1 décembre 2026')
    expect(wrapper.text()).toContain('28 février 2027')

    await wrapper.find('button').trigger('click')
    expect(joinTournament).toHaveBeenCalled()
  })

  it('offers no join button to someone already in', () => {
    const { wrapper } = mountFor({ isParticipant: true, canJoinTournament: true })
    expect(wrapper.find('button').exists()).toBe(false)
  })
})
