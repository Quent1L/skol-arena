import { describe, it, expect, vi } from 'vitest'
import { mountWithPlugins } from '@/test-support/mount'
import BracketMatchCard from '../BracketMatchCard.vue'
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import type { ClientBracketSeed, ClientMatchModel } from '@skol-arena/shared'

vi.mock('vue-i18n', async () => (await import('@/test-support/mock-modules')).i18nEchoMock())
vi.mock('@/composables/avatar/avatar.service', () => ({
  useAvatarService: () => ({ versionFor: () => null, avatarUrl: vi.fn(), avatarSrcset: vi.fn() }),
}))

function seed(entryId: string, entry: Partial<NonNullable<ClientBracketSeed['entry']>>) {
  return {
    entryId,
    entry: { id: entryId, tournamentId: 't1', createdAt: '', players: [], ...entry },
  } as unknown as ClientBracketSeed
}

const match = {
  id: 'm1',
  status: 'scheduled',
  sides: [
    { position: 1, entryId: 'e-player', score: null },
    { position: 2, entryId: 'e-team', score: null },
  ],
} as unknown as ClientMatchModel

const seeds = [
  seed('e-player', {
    entryType: 'PLAYER',
    players: [{ playerId: 'p1', player: { id: 'p1', displayName: 'Theo Marchand', shortName: 'TMA' } }],
  }),
  seed('e-team', { entryType: 'TEAM', team: { id: 'team-1', name: 'Blue' } }),
]

describe('BracketMatchCard', () => {
  it('resolves a single-player entry to its player avatar, never a team', () => {
    const wrapper = mountWithPlugins(BracketMatchCard, {
      props: { match, seeds, roundName: 'Final', bracketType: 'winners' },
    })

    const avatars = wrapper.findAllComponents(PlayerAvatar)
    expect(avatars.map((a) => a.props('playerId'))).toEqual(['p1', null])
    expect(avatars.map((a) => a.props('name'))).toEqual(['TMA', 'Blue'])
  })
})
