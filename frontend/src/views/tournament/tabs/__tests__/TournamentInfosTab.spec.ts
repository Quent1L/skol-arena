import { describe, expect, it, vi } from 'vitest'
import { mountWithUi } from '@/test-support/mount'
import { makeTournament } from '@/test-support/factories'
import TournamentInfosTab from '../TournamentInfosTab.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'fr' } }),
  createI18n: () => ({ global: { t: (key: string) => key }, install: () => {} }),
}))
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => ({ params: { id: 't1' } }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/stores/tournamentDetail.store', () => ({
  useTournamentDetailStore: () => ({
    tournament: makeTournament({
      // Revived by the HTTP interceptor as local midnight.
      startDate: new Date(2026, 8, 8) as unknown as string,
      endDate: new Date(2026, 11, 7) as unknown as string,
    }),
    participantCount: 0,
  }),
}))

describe('TournamentInfosTab', () => {
  it('shows the tournament start and end days', () => {
    const wrapper = mountWithUi(TournamentInfosTab)
    const dates = wrapper.find('[data-testid="tournament-dates"]').text()
    expect(dates).toContain('8 septembre 2026')
    expect(dates).toContain('7 décembre 2026')
  })
})
