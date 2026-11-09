/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import http from '@/config/ApiConfig'
import { invitationApi } from '../invitation/invitation.api'
import { organizationApi } from '../organization/organization.api'
import { participantApi } from '../participant.api'
import { matchApi } from '../match/match.api'
import { outcomeTypeApi } from '../outcome-type.api'
import { disciplineApi } from '../discipline/discipline.api'

vi.mock('@/config/ApiConfig', async () =>
  (await import('@/test-support/mock-modules')).apiConfigMock(),
)

const client = http as unknown as Record<'get' | 'post' | 'patch' | 'put' | 'delete', ReturnType<typeof vi.fn>>

type Verb = 'get' | 'post' | 'patch' | 'delete'
/** [label, call, verb, url, expected extra arguments to the HTTP client] */
type Case = [string, () => Promise<unknown>, Verb, string, unknown[]]

beforeEach(() => {
  vi.clearAllMocks()
  for (const verb of ['get', 'post', 'patch', 'delete'] as const) {
    client[verb].mockResolvedValue({ data: { echoed: verb } })
  }
})

function run(cases: Case[]) {
  it.each(cases)('%s', async (_label, call, verb, url, extra) => {
    const result = await call()

    expect(client[verb]).toHaveBeenCalledTimes(1)
    expect(client[verb]).toHaveBeenCalledWith(url, ...extra)
    expect(result).toEqual({ echoed: verb })
  })
}

describe('invitationApi', () => {
  run([
    ['validates a code', () => invitationApi.validate('C'), 'post', '/api/invitations/validate', [{ code: 'C' }]],
    ['consumes a code', () => invitationApi.consume('C'), 'post', '/api/invitations/consume', [{ code: 'C' }]],
    ['generates a code', () => invitationApi.generate({ maxUses: 2 }), 'post', '/api/admin/invitations/generate', [{ maxUses: 2 }]],
    ['lists the codes', () => invitationApi.getAll(), 'get', '/api/admin/invitations', []],
    ['deactivates a code', () => invitationApi.deactivate('i1'), 'patch', '/api/admin/invitations/i1/deactivate', []],
    ['joins an organization', () => invitationApi.joinOrganization('C'), 'post', '/api/invitations/join-organization', [{ code: 'C' }]],
  ])
})

describe('organizationApi', () => {
  run([
    ['lists organizations', () => organizationApi.list(), 'get', '/api/admin/organizations', []],
    ['creates one', () => organizationApi.create('Org'), 'post', '/api/admin/organizations', [{ name: 'Org' }]],
    ['lists members', () => organizationApi.getMembers('o1'), 'get', '/api/admin/organizations/o1/members', []],
    ['renames', () => organizationApi.rename('o1', 'New'), 'patch', '/api/admin/organizations/o1', [{ name: 'New' }]],
  ])

  it('adds and removes a member without returning anything', async () => {
    await expect(organizationApi.addMember('o1', 'u1')).resolves.toBeUndefined()
    expect(client.post).toHaveBeenCalledWith('/api/admin/organizations/o1/members', { userId: 'u1' })

    await expect(organizationApi.removeMember('o1', 'u1')).resolves.toBeUndefined()
    expect(client.delete).toHaveBeenCalledWith('/api/admin/organizations/o1/members/u1')
  })
})

describe('participantApi', () => {
  run([
    ['joins a tournament', () => participantApi.joinTournament('t1'), 'post', '/api/tournaments/t1/participants', [{ tournamentId: 't1' }]],
    ['leaves a tournament', () => participantApi.leaveTournament('t1'), 'delete', '/api/tournaments/t1/participants', []],
    ['lists the participants', () => participantApi.getTournamentParticipants('t1'), 'get', '/api/tournaments/t1/participants', []],
    ['adds a participant as admin', () => participantApi.adminAddParticipant('t1', 'u1'), 'post', '/api/tournaments/t1/participants/add', [{ userId: 'u1' }]],
    ['removes a participant as admin', () => participantApi.adminRemoveParticipant('t1', 'u1'), 'delete', '/api/tournaments/t1/participants/u1', []],
  ])
})

describe('matchApi', () => {
  const payload = { any: 'payload' } as any
  run([
    ['creates a match', () => matchApi.create(payload), 'post', '/api/matches', [payload]],
    ['lists match cards with filters as query params', () => matchApi.list({ bracketMode: 'true' }), 'get', '/api/matches', [{ params: { bracketMode: 'true' } }]],
    ['gets one match', () => matchApi.getById('m1'), 'get', '/api/matches/m1', []],
    ['updates', () => matchApi.update('m1', payload), 'patch', '/api/matches/m1', [payload]],
    ['deletes', () => matchApi.delete('m1'), 'delete', '/api/matches/m1', []],
    ['reports a result', () => matchApi.reportResult('m1', payload), 'post', '/api/matches/m1/report', [payload]],
    ['confirms with an empty body by default', () => matchApi.confirmResult('m1'), 'post', '/api/matches/m1/confirm', [{}]],
    ['contests', () => matchApi.contestResult('m1', payload), 'post', '/api/matches/m1/contest', [payload]],
    ['responds to an invitation', () => matchApi.respondToMatch('m1', payload), 'post', '/api/matches/m1/respond', [payload]],
    ['finalizes', () => matchApi.finalize('m1', payload), 'post', '/api/matches/m1/finalize', [payload]],
    ['cancels', () => matchApi.cancel('m1'), 'post', '/api/matches/m1/cancel', []],
    ['validates a draft', () => matchApi.validate(payload), 'post', '/api/matches/validate', [payload]],
  ])
})

describe('outcomeTypeApi', () => {
  run([
    ['lists without a query when no option is given', () => outcomeTypeApi.list(), 'get', '/api/outcome-types', [{ params: undefined }]],
    ['filters by discipline', () => outcomeTypeApi.list('d1'), 'get', '/api/outcome-types', [{ params: { disciplineId: 'd1' } }]],
    ['asks for the archived ones too', () => outcomeTypeApi.list('d1', true), 'get', '/api/outcome-types', [{ params: { disciplineId: 'd1', includeArchived: 'true' } }]],
    ['gets one', () => outcomeTypeApi.getById('o1'), 'get', '/api/outcome-types/o1', []],
    ['creates', () => outcomeTypeApi.create({ name: 'n' } as any), 'post', '/api/outcome-types', [{ name: 'n' }]],
    ['updates', () => outcomeTypeApi.update('o1', { name: 'n' } as any), 'patch', '/api/outcome-types/o1', [{ name: 'n' }]],
    ['archives', () => outcomeTypeApi.archive('o1'), 'post', '/api/outcome-types/o1/archive', []],
    ['restores', () => outcomeTypeApi.restore('o1'), 'post', '/api/outcome-types/o1/restore', []],
    ['deletes', () => outcomeTypeApi.delete('o1'), 'delete', '/api/outcome-types/o1', []],
  ])
})

describe('disciplineApi', () => {
  run([
    ['lists the active ones', () => disciplineApi.list(), 'get', '/api/disciplines', [{ params: undefined }]],
    ['lists the archived ones too', () => disciplineApi.list(true), 'get', '/api/disciplines', [{ params: { includeArchived: 'true' } }]],
    ['lists the interaction modes', () => disciplineApi.listInteractionModes(), 'get', '/api/disciplines/interaction-modes', []],
    ['gets one', () => disciplineApi.getById('d1'), 'get', '/api/disciplines/d1', []],
    ['creates', () => disciplineApi.create({ name: 'n' } as any), 'post', '/api/disciplines', [{ name: 'n' }]],
    ['updates', () => disciplineApi.update('d1', { name: 'n' } as any), 'patch', '/api/disciplines/d1', [{ name: 'n' }]],
    ['lists the impacted competitions', () => disciplineApi.listImpactedCompetitions('d1'), 'get', '/api/disciplines/d1/impacted-competitions', []],
    ['propagates to the chosen tournaments', () => disciplineApi.propagate('d1', ['t1']), 'post', '/api/disciplines/d1/propagate', [{ tournamentIds: ['t1'] }]],
    ['archives', () => disciplineApi.archive('d1'), 'post', '/api/disciplines/d1/archive', []],
    ['restores', () => disciplineApi.restore('d1'), 'post', '/api/disciplines/d1/restore', []],
    ['deletes', () => disciplineApi.delete('d1'), 'delete', '/api/disciplines/d1', []],
  ])
})
