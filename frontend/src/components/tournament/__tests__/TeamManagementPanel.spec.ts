import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import type { ClientTeam } from '@skol-arena/shared/types/index'
import { mountWithUi } from '@/test-support/mount'
import TeamManagementPanel from '../TeamManagementPanel.vue'

vi.mock('vue-i18n', async () => (await import('@/test-support/mock-modules')).i18nEchoMock())

const teams = ref<ClientTeam[]>([])
const service = {
  teams,
  loading: ref(false),
  loadTeams: vi.fn(async () => {}),
  createTeam: vi.fn(async () => {}),
  joinTeam: vi.fn(async () => {}),
  leaveTeam: vi.fn(async () => {}),
  deleteTeam: vi.fn(async () => {}),
}
vi.mock('@/composables/team/team.service', () => ({ useTeamService: () => service }))

const getParticipants = vi.fn(async () => [] as unknown[])
vi.mock('@/composables/participant.api', () => ({
  participantApi: { getTournamentParticipants: (...a: unknown[]) => getParticipants(...(a as [])) },
}))

const handlers = new Map<string, (data: unknown) => void>()
const off = vi.fn()
const sendWsMessage = vi.fn()
vi.mock('@/composables/notification/notification.socket', () => ({
  onWsEvent: (event: string, cb: (data: unknown) => void) => {
    handlers.set(event, cb)
    return off
  },
  sendWsMessage: (...a: unknown[]) => sendWsMessage(...a),
}))

const team = (id: string, members: string[], extra: Partial<ClientTeam> = {}): ClientTeam =>
  ({
    id,
    name: `Team ${id}`,
    tournamentId: 't1',
    createdBy: 'creator',
    hasMatch: false,
    members: members.map((userId) => ({
      id: `m-${userId}`,
      userId,
      user: { id: userId, displayName: userId },
    })),
    ...extra,
  }) as unknown as ClientTeam

interface Vm {
  isLocked: boolean
  isAlreadyInTeam: boolean
  canCreate: boolean
  userCurrentTeamId: string | null
  newTeamName: string
  availableParticipants: { label: string; value: string }[]
  selectedUserId: string | null
  targetTeam: ClientTeam | null
  addPlayerDialogVisible: boolean
  isMemberOf: (t: ClientTeam) => boolean
  canJoinTeam: (t: ClientTeam) => boolean
  isTeamLocked: (t: ClientTeam) => boolean
  canDelete: (t: ClientTeam) => boolean
  openAddPlayerDialog: (t: ClientTeam) => void
  handleAdminAddPlayer: () => Promise<void>
  handleCreate: () => Promise<void>
  handleJoin: (id: string) => Promise<void>
  handleLeave: (id: string) => Promise<void>
  handleDelete: (id: string) => Promise<void>
}

async function mountPanel(props: Record<string, unknown> = {}) {
  const wrapper = mountWithUi(TeamManagementPanel, {
    props: {
      tournamentId: 't1',
      currentUserId: 'me',
      isParticipant: true,
      canManage: false,
      ...props,
    },
  })
  await flushPromises()
  return { wrapper, vm: wrapper.findComponent(TeamManagementPanel).vm as unknown as Vm }
}

beforeEach(() => {
  vi.clearAllMocks()
  handlers.clear()
  teams.value = []
  getParticipants.mockResolvedValue([])
})

describe('TeamManagementPanel — loading and live updates', () => {
  it('loads the teams, subscribes to the tournament and unsubscribes on unmount', async () => {
    const { wrapper } = await mountPanel()
    expect(service.loadTeams).toHaveBeenCalledWith('t1')
    expect(sendWsMessage).toHaveBeenCalledWith({
      event: 'subscribe_tournament',
      tournamentId: 't1',
    })

    wrapper.unmount()
    expect(sendWsMessage).toHaveBeenCalledWith({
      event: 'unsubscribe_tournament',
      tournamentId: 't1',
    })
    expect(off).toHaveBeenCalledTimes(3)
  })

  it('only loads the participants for someone who can manage', async () => {
    await mountPanel()
    expect(getParticipants).not.toHaveBeenCalled()
    await mountPanel({ canManage: true })
    expect(getParticipants).toHaveBeenCalledWith('t1')
  })

  it('applies team_created, team_updated and team_deleted events', async () => {
    await mountPanel()
    handlers.get('team_created')!(team('a', []))
    handlers.get('team_created')!(team('a', []))
    expect(teams.value.map((t) => t.id)).toEqual(['a'])

    handlers.get('team_updated')!(team('a', ['x']))
    handlers.get('team_updated')!(team('ghost', []))
    expect(teams.value).toHaveLength(1)
    expect(teams.value[0]!.members).toHaveLength(1)

    handlers.get('team_deleted')!({ teamId: 'a' })
    expect(teams.value).toEqual([])
  })
})

describe('TeamManagementPanel — rules', () => {
  it('locks teams once the tournament is under way', async () => {
    expect((await mountPanel({ tournamentStatus: 'ongoing' })).vm.isLocked).toBe(true)
    expect((await mountPanel({ tournamentStatus: 'finished' })).vm.isLocked).toBe(true)
    expect((await mountPanel({ tournamentStatus: 'open' })).vm.isLocked).toBe(false)
  })

  it('also locks a team that already played', async () => {
    const { vm } = await mountPanel()
    expect(vm.isTeamLocked(team('a', [], { hasMatch: true }))).toBe(true)
    expect(vm.isTeamLocked(team('a', []))).toBe(false)
  })

  it('lets a participant create a team until they join one', async () => {
    const { vm } = await mountPanel()
    expect(vm.canCreate).toBe(true)
    teams.value = [team('a', ['me'])]
    expect(vm.userCurrentTeamId).toBe('a')
    expect(vm.isAlreadyInTeam).toBe(true)
    expect(vm.canCreate).toBe(false)
  })

  it('always lets a manager create, and refuses a non-participant', async () => {
    teams.value = [team('a', ['me'])]
    expect((await mountPanel({ canManage: true })).vm.canCreate).toBe(true)
    teams.value = []
    expect((await mountPanel({ isParticipant: false })).vm.canCreate).toBe(false)
  })

  it('knows membership and who may join', async () => {
    const { vm } = await mountPanel()
    const mine = team('a', ['me'])
    const other = team('b', ['x'])
    expect(vm.isMemberOf(mine)).toBe(true)
    expect(vm.isMemberOf(other)).toBe(false)
    expect(vm.canJoinTeam(other)).toBe(true)
    teams.value = [mine]
    expect(vm.canJoinTeam(other)).toBe(false)

    expect((await mountPanel({ currentUserId: undefined })).vm.canJoinTeam(other)).toBe(false)
    expect((await mountPanel({ currentUserId: undefined })).vm.isMemberOf(other)).toBe(false)
    teams.value = []
    expect((await mountPanel({ isParticipant: false })).vm.canJoinTeam(other)).toBe(false)
  })

  it('lets creators and managers delete, not a sole member or anyone once locked', async () => {
    const own = team('a', ['x', 'y'], { createdBy: 'me' })
    const foreign = team('b', ['x', 'y'])
    const { vm } = await mountPanel()
    expect(vm.canDelete(own)).toBe(true)
    expect(vm.canDelete(foreign)).toBe(false)
    expect(vm.canDelete(team('c', ['me'], { createdBy: 'me' }))).toBe(false)

    expect((await mountPanel({ canManage: true })).vm.canDelete(foreign)).toBe(true)
    expect(
      (await mountPanel({ canManage: true, tournamentStatus: 'ongoing' })).vm.canDelete(foreign),
    ).toBe(false)
    expect(
      (await mountPanel({ currentUserId: undefined, canManage: true })).vm.canDelete(foreign),
    ).toBe(false)
  })
})

describe('TeamManagementPanel — actions', () => {
  it('creates a team with a trimmed name, ignoring a blank one', async () => {
    const { vm } = await mountPanel()
    vm.newTeamName = '   '
    await vm.handleCreate()
    expect(service.createTeam).not.toHaveBeenCalled()

    vm.newTeamName = '  Reds  '
    await vm.handleCreate()
    expect(service.createTeam).toHaveBeenCalledWith('t1', 'Reds')
    expect(vm.newTeamName).toBe('')
  })

  it('joins, leaves and deletes through the service', async () => {
    const { vm } = await mountPanel()
    await vm.handleJoin('a')
    await vm.handleLeave('a')
    await vm.handleDelete('a')
    expect(service.joinTeam).toHaveBeenCalledWith('t1', 'a')
    expect(service.leaveTeam).toHaveBeenCalledWith('t1', 'a')
    expect(service.deleteTeam).toHaveBeenCalledWith('t1', 'a')
  })

  it('lets a manager add a player who is not already a member', async () => {
    getParticipants.mockResolvedValue([
      { userId: 'x', user: { displayName: 'Xavier' } },
      { userId: 'z', user: { displayName: 'Zoe' } },
    ])
    const { vm } = await mountPanel({ canManage: true })
    expect(vm.availableParticipants).toEqual([])

    vm.openAddPlayerDialog(team('a', ['x']))
    expect(vm.addPlayerDialogVisible).toBe(true)
    expect(vm.availableParticipants).toEqual([{ label: 'Zoe', value: 'z' }])

    await vm.handleAdminAddPlayer()
    expect(service.joinTeam).not.toHaveBeenCalled()

    vm.selectedUserId = 'z'
    await vm.handleAdminAddPlayer()
    expect(service.joinTeam).toHaveBeenCalledWith('t1', 'a', 'z')
    expect(vm.addPlayerDialogVisible).toBe(false)
  })
})
