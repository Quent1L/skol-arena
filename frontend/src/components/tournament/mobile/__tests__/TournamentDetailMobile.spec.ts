import { describe, it, expect, vi } from 'vitest'
import { defineComponent, h, reactive, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

vi.mock('vue-i18n', async () => (await import('@/test-support/mock-modules')).i18nEchoMock())
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { tab: 'standings' }, query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/composables/ui/useSubTabs', () => ({
  useSubTabs: () => ({ active: ref('profile'), setActive: vi.fn() }),
}))

const store = reactive({
  tournamentId: 't1',
  tournament: {
    name: 'Cup',
    status: 'ongoing',
    mode: 'championship',
    teamMode: 'static',
    allowDraw: false,
    scoreEnabled: true,
    validationMode: 'none',
  },
  hasNotStarted: false,
  isAuthenticated: true,
  isParticipant: true,
  appUser: { id: 'me' },
  standingsRefreshKey: 0,
  ensurePlayerProfile: vi.fn(),
  ensurePlayerCareer: vi.fn(),
})
vi.mock('@/stores/tournamentDetail.store', () => ({ useTournamentDetailStore: () => store }))
vi.mock('@/utils/standings-config', () => ({ toStandingsConfig: () => ({}) }))

const StandingsStub = defineComponent({
  name: 'StandingsStub',
  props: ['teamMode'],
  render: () => h('div'),
})
vi.mock('@/components/tournament/StandingsTable.vue', () => ({ __esModule: true, default: StandingsStub }))

import TournamentDetailMobile from '../TournamentDetailMobile.vue'

describe('TournamentDetailMobile', () => {
  // Without it StandingsTable defaults to flex and links a fixed team's rows to /players/<teamId>.
  it('tells the standings the team mode, so fixed teams never link to a player page', async () => {
    const wrapper = mount(TournamentDetailMobile, {
      global: {
        stubs: {
          TournamentHeader: true,
          TournamentInfosTab: true,
          MobileBottomNav: true,
          TournamentNotStarted: true,
          SubTabTrack: true,
        },
      },
    })
    await flushPromises()

    expect(wrapper.findComponent(StandingsStub).props('teamMode')).toBe('static')
  })
})
