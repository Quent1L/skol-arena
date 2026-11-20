import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mountWithUi } from '@/test-support/mount'
import TeamsStep from '../TeamsStep.vue'
import PlayerPickerDialog from '@/components/match/mobile/PlayerPickerDialog.vue'
import type { ClientTeam, MatchSideInput } from '@skol-arena/shared/types/index'

vi.mock('vue-i18n', async () => (await import('@/test-support/mock-modules')).i18nEchoMock())
vi.mock('@/config/ApiConfig', async () =>
  (await import('@/test-support/mock-modules')).apiConfigMock(),
)
vi.mock('@/composables/match/match.service', () => ({
  useMatchService: () => ({ validateMatchSides: vi.fn() }),
}))
const isMobile = ref(false)
vi.mock('@/composables/useViewport', () => ({ useViewport: () => ({ isMobile }) }))

function team(id: string, name: string, players: string[]): ClientTeam {
  return {
    id,
    name,
    members: players.map((displayName, i) => ({ id: `${id}${i}`, user: { displayName } })),
  } as unknown as ClientTeam
}

const teams = [team('t1', 'Lions', ['Ann', 'Bob']), team('t2', 'Tigers', ['Cid', 'Dan'])]

function mountStep(sides: MatchSideInput[]) {
  const updates: MatchSideInput[][] = []
  const wrapper = mountWithUi(TeamsStep, {
    props: {
      tournamentId: 'x',
      teams,
      sides,
      'onUpdate:sides': (v: MatchSideInput[]) => updates.push(v),
    },
    global: { stubs: { PlayerPickerDialog: true } },
  })
  return { wrapper, updates }
}

const emptySides = [{ position: 1 }, { position: 2 }] as MatchSideInput[]

beforeEach(() => {
  isMobile.value = false
})

describe('TeamsStep — team pick', () => {
  it('previews the first five players of a team, then the rest as a count', () => {
    const big = team('t3', 'Bears', ['A', 'B', 'C', 'D', 'E', 'F', 'G'])
    const wrapper = mountWithUi(TeamsStep, {
      props: { tournamentId: 'x', teams: [big], sides: emptySides },
      global: { stubs: { PlayerPickerDialog: true } },
    })
    expect(wrapper.findComponent(PlayerPickerDialog).props('players')).toEqual([
      { id: 't3', displayName: 'Bears', subtitle: 'A, B, C, D, E +2' },
    ])
  })

  it('uses an autocomplete on desktop', () => {
    const { wrapper } = mountStep(emptySides)
    expect(wrapper.findAllComponents({ name: 'InputMenu' })).toHaveLength(1)
    expect(wrapper.findComponent(PlayerPickerDialog).props('visible')).toBe(false)
  })

  it('opens one multi-select picker listing every team on mobile', async () => {
    isMobile.value = true
    const { wrapper } = mountStep(emptySides)
    expect(wrapper.findAllComponents({ name: 'InputMenu' })).toHaveLength(0)

    await wrapper.find('button').trigger('click')
    const dialog = wrapper.findComponent(PlayerPickerDialog)
    expect(dialog.props('visible')).toBe(true)
    expect(dialog.props('single')).toBe(false)
    expect(dialog.props('players')).toEqual([
      { id: 't1', displayName: 'Lions', subtitle: 'Ann, Bob' },
      { id: 't2', displayName: 'Tigers', subtitle: 'Cid, Dan' },
    ])
  })

  it('fills the sides in pick order and ignores a pick beyond the last side', () => {
    isMobile.value = true
    const { wrapper, updates } = mountStep([
      { position: 1, teamId: 't1' },
      { position: 2 },
    ] as MatchSideInput[])
    const dialog = wrapper.findComponent(PlayerPickerDialog)
    expect(dialog.props('selectedIds')).toEqual(['t1'])
    expect(wrapper.text()).toContain('Lions')

    dialog.vm.$emit('update:selectedIds', ['t1', 't2'])
    expect(updates.at(-1)).toEqual([
      { position: 1, teamId: 't1' },
      { position: 2, teamId: 't2' },
    ])

    dialog.vm.$emit('update:selectedIds', ['t1', 't2', 't3'])
    expect(updates).toHaveLength(1)
  })

  it('removes a selected team and shifts the next one up', async () => {
    const { wrapper, updates } = mountStep([
      { position: 1, teamId: 't1' },
      { position: 2, teamId: 't2' },
    ] as MatchSideInput[])
    await wrapper.find('button[aria-label="common.delete"]').trigger('click')
    expect(updates.at(-1)).toEqual([
      { position: 1, teamId: 't2' },
      { position: 2, teamId: undefined },
    ])
  })
})
