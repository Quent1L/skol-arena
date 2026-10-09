import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import type { ClientTournamentSummary } from '@skol-arena/shared'
import { mountWithUi } from '@/test-support/mount'
import TournamentsView from '@/views/TournamentsView.vue'
import { useAuth } from '@/composables/useAuth'
import { makeAuthMock, type AuthMockState } from '@/test-support/mock-modules'

vi.mock('vue-i18n', async () => (await import('@/test-support/mock-modules')).i18nEchoMock())
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/composables/useAuth', () => ({ useAuth: vi.fn() }))

const tournaments = ref<ClientTournamentSummary[]>([])
const seasons = ref<ClientTournamentSummary[]>([])

vi.mock('@/composables/tournament/tournament.service', () => ({
  useTournamentService: () => ({
    tournaments,
    loading: ref(false),
    error: ref(null),
    listTournaments: vi.fn(),
  }),
}))
vi.mock('@/composables/ranked/ranked.service', () => ({
  useRankedService: () => ({ seasons, loading: ref(false), loadSeasons: vi.fn() }),
}))
vi.mock('@/components/rewind/RewindPromoCard.vue', () => ({
  default: { name: 'RewindPromoCard', template: '<div />' },
}))

const DAY = 86_400_000

function makeEvent(over: Partial<ClientTournamentSummary> = {}): ClientTournamentSummary {
  return {
    id: 'e1',
    name: 'Event',
    mode: 'championship',
    teamMode: 'flex',
    status: 'ongoing',
    startDate: new Date(Date.now() - 10 * DAY),
    endDate: new Date(Date.now() + 10 * DAY),
    participantCount: 4,
    isParticipant: false,
    ...over,
  } as ClientTournamentSummary
}

const state: AuthMockState = {
  user: { id: 'u1', email: 'player@example.com' },
  role: 'player',
  initialized: true,
}

async function mountView() {
  vi.mocked(useAuth).mockReturnValue(makeAuthMock(state) as never)
  const wrapper = mountWithUi(TournamentsView)
  await flushPromises()
  return wrapper
}

/**
 * Sections are addressed by their header key, not by position: the "my events"
 * section is dropped altogether when the player has joined nothing.
 */
function sectionText(wrapper: Awaited<ReturnType<typeof mountView>>, titleKey: string) {
  const section = wrapper.findAll('section').find((s) => s.text().includes(titleKey))
  return section?.text() ?? null
}

const MY_EVENTS = 'tournamentsView.myEvents.title'
const DISCOVER = 'tournamentsView.discover.title'

function chip(wrapper: Awaited<ReturnType<typeof mountView>>, label: string) {
  return wrapper.findAll('button').find((button) => button.text().includes(label))
}

describe('TournamentsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tournaments.value = []
    seasons.value = []
  })

  it("puts the player's own events in the first section and the rest in discover", async () => {
    tournaments.value = [
      makeEvent({ id: 'mine', name: 'Ligue interne', isParticipant: true }),
      makeEvent({ id: 'other', name: 'Open Cup' }),
    ]

    const wrapper = await mountView()

    expect(sectionText(wrapper, MY_EVENTS)).toContain('Ligue interne')
    expect(sectionText(wrapper, MY_EVENTS)).not.toContain('Open Cup')
    expect(sectionText(wrapper, DISCOVER)).toContain('Open Cup')
    expect(sectionText(wrapper, DISCOVER)).not.toContain('Ligue interne')
  })

  it('hides the discover section when there is nothing to join', async () => {
    tournaments.value = [makeEvent({ id: 'mine', name: 'Ligue interne', isParticipant: true })]

    const wrapper = await mountView()

    expect(sectionText(wrapper, DISCOVER)).toBeNull()
    expect(sectionText(wrapper, MY_EVENTS)).toContain('Ligue interne')
  })

  it('keeps the discover section when a filter is what emptied it', async () => {
    tournaments.value = [
      makeEvent({
        id: 'cup',
        name: 'Open Cup',
        mode: 'bracket',
        discipline: { id: 'd1', name: 'Babyfoot' },
      }),
    ]
    seasons.value = [
      makeEvent({
        id: 'season',
        name: 'Ranked Season',
        mode: 'ranked',
        discipline: { id: 'd2', name: 'Pétanque' },
      }),
    ]

    const wrapper = await mountView()
    await chip(wrapper, 'tournamentsView.tags.bracket')!.trigger('click')
    await chip(wrapper, 'Pétanque')!.trigger('click')

    const discover = sectionText(wrapper, DISCOVER)
    expect(discover).not.toContain('Open Cup')
    expect(discover).not.toContain('Ranked Season')
    expect(discover).toContain('tournamentsView.empty.withFilters')
    expect(discover).toContain('tournamentsView.clearFilters')
  })

  it('explains an instance with no event at all rather than rendering a blank page', async () => {
    const wrapper = await mountView()

    expect(sectionText(wrapper, MY_EVENTS)).toBeNull()
    expect(sectionText(wrapper, DISCOVER)).toContain('tournamentsView.empty.title')
  })

  it('only offers chips for events the filters can actually reach', async () => {
    tournaments.value = [
      makeEvent({ id: 'mine', name: 'Mon bracket', mode: 'bracket', isParticipant: true }),
      makeEvent({ id: 'cup', name: 'Open Cup', mode: 'championship' }),
    ]

    const wrapper = await mountView()

    // `bracket` only exists among the joined events, which the chips never filter.
    expect(chip(wrapper, 'tournamentsView.tags.bracket')).toBeUndefined()
    expect(chip(wrapper, 'tournamentsView.tags.championship')).toBeDefined()
  })

  it('hides the my-events section entirely when nothing is joined', async () => {
    tournaments.value = [makeEvent({ id: 'other', name: 'Open Cup' })]

    const wrapper = await mountView()

    expect(sectionText(wrapper, MY_EVENTS)).toBeNull()
    expect(sectionText(wrapper, DISCOVER)).toContain('Open Cup')
  })

  it('keeps an event finished within the grace window out of the archives', async () => {
    tournaments.value = [
      makeEvent({
        id: 'fresh',
        name: 'Saison close hier',
        status: 'finished',
        isParticipant: true,
        endDate: new Date(Date.now() - 1 * DAY),
      }),
    ]

    const wrapper = await mountView()

    expect(sectionText(wrapper, MY_EVENTS)).toContain('Saison close hier')
    expect(wrapper.text()).not.toContain('tournamentsView.archives.toggle')
  })

  it('archives an event finished beyond the grace window', async () => {
    tournaments.value = [
      makeEvent({
        id: 'old',
        name: 'Saison close le mois dernier',
        status: 'finished',
        isParticipant: true,
        endDate: new Date(Date.now() - 30 * DAY),
      }),
    ]

    const wrapper = await mountView()

    expect(sectionText(wrapper, MY_EVENTS)).toBeNull()
    expect(wrapper.text()).toContain('tournamentsView.archives.toggle')

    await wrapper.find('[aria-expanded]').trigger('click')
    expect(wrapper.text()).toContain('Saison close le mois dernier')
  })

  it('filters discover by mode without touching the player section', async () => {
    tournaments.value = [
      makeEvent({ id: 'mine', name: 'Mon championnat', isParticipant: true }),
      makeEvent({ id: 'cup', name: 'Open Cup', mode: 'bracket' }),
    ]
    seasons.value = [makeEvent({ id: 'season', name: 'Ranked Season', mode: 'ranked' })]

    const wrapper = await mountView()

    const rankedChip = chip(wrapper, 'tournamentsView.tags.ranked')
    expect(rankedChip).toBeDefined()
    await rankedChip!.trigger('click')

    expect(sectionText(wrapper, DISCOVER)).toContain('Ranked Season')
    expect(sectionText(wrapper, DISCOVER)).not.toContain('Open Cup')
    expect(sectionText(wrapper, MY_EVENTS)).toContain('Mon championnat')
  })

  it('hides draft seasons from a regular player', async () => {
    seasons.value = [
      makeEvent({ id: 'draft', name: 'Saison brouillon', mode: 'ranked', status: 'draft' }),
    ]

    const wrapper = await mountView()

    expect(wrapper.text()).not.toContain('Saison brouillon')
  })
})
