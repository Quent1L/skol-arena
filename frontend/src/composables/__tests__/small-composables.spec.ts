import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import { useFieldEditability } from '../useFieldEditability'
import { useFormReferences } from '../useFormReferences'
import { useUserService } from '../user/user.service'
import { userApi } from '../user/user.api'
import { useDisciplineService } from '../discipline/discipline.service'
import { useGameRulesService } from '../game-rules/game-rules.service'
import { useOrganizationService } from '../organization/organization.service'

vi.mock('@/config/ApiConfig', async () =>
  (await import('@/test-support/mock-modules')).apiConfigMock(),
)
vi.mock('@/i18n', () => ({ i18n: { global: { t: (key: string) => key } } }))
vi.mock('../user/user.api')
vi.mock('../discipline/discipline.service')
vi.mock('../game-rules/game-rules.service')
vi.mock('../organization/organization.service')

beforeEach(() => vi.clearAllMocks())

describe('useFieldEditability', () => {
  const editability = {
    editable: ['name'],
    locked: ['format'],
    recalculating: ['scoring'],
    enteredMatchCount: 4,
  } as never

  it('leaves every field open on a form without constraints', () => {
    const { canEdit, triggersRecalculation, lockedByMatches, enteredMatchCount } =
      useFieldEditability(null)

    expect(canEdit('anything')).toBe(true)
    expect(triggersRecalculation('anything')).toBe(false)
    expect(lockedByMatches('anything')).toBe(false)
    expect(enteredMatchCount.value).toBe(0)
  })

  it('follows what the API says is editable, recalculating or locked', () => {
    const { canEdit, triggersRecalculation, lockedByMatches, enteredMatchCount } =
      useFieldEditability(() => editability)

    expect(canEdit('name')).toBe(true)
    expect(canEdit('format')).toBe(false)
    expect(triggersRecalculation('scoring')).toBe(true)
    expect(triggersRecalculation('name')).toBe(false)
    expect(lockedByMatches('format')).toBe(true)
    expect(lockedByMatches('name')).toBe(false)
    expect(enteredMatchCount.value).toBe(4)
  })

  it('does not blame matches for a lock when none were entered', () => {
    const { lockedByMatches } = useFieldEditability(
      ref({ ...(editability as object), enteredMatchCount: 0 } as never),
    )

    expect(lockedByMatches('format')).toBe(false)
  })
})

describe('useUserService', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))

  it('loads the users', async () => {
    vi.mocked(userApi.list).mockResolvedValue([{ id: 'u1' }] as never)
    const service = useUserService()

    expect(await service.listUsers()).toEqual([{ id: 'u1' }])

    expect(service.users.value).toEqual([{ id: 'u1' }])
    expect(service.loading.value).toBe(false)
    expect(service.error.value).toBeNull()
  })

  it('returns an empty list and keeps the error when loading fails', async () => {
    vi.mocked(userApi.list).mockRejectedValueOnce(new Error('denied'))
    const service = useUserService()
    expect(await service.listUsers()).toEqual([])
    expect(service.error.value).toBe('denied')

    vi.mocked(userApi.list).mockRejectedValueOnce('x')
    await service.listUsers()
    expect(service.error.value).toBe('loadErrors.users')
    expect(service.loading.value).toBe(false)
  })
})

describe('useFormReferences', () => {
  const listDisciplines = vi.fn()
  const loadRules = vi.fn()
  const listOrganizations = vi.fn()
  const disciplines = ref([{ id: 'd1', name: 'Darts' }])
  const rules = ref([{ id: 'r1', title: 'Standard' }])

  beforeEach(() => {
    listDisciplines.mockResolvedValue(undefined)
    loadRules.mockResolvedValue(undefined)
    listOrganizations.mockResolvedValue([{ id: 'o1', name: 'Org' }])
    vi.mocked(useDisciplineService).mockReturnValue({ disciplines, listDisciplines } as never)
    vi.mocked(useGameRulesService).mockReturnValue({ rules, loadRules } as never)
    vi.mocked(useOrganizationService).mockReturnValue({ listOrganizations } as never)
  })

  it('turns disciplines and rules into select options', () => {
    const refs = useFormReferences()

    expect(refs.disciplineOptions.value).toEqual([{ label: 'Darts', value: 'd1' }])
    expect(refs.rulesOptions.value).toEqual([{ label: 'Standard', value: 'r1' }])
  })

  it('loads the three lists together', async () => {
    const refs = useFormReferences()

    await refs.loadAll()

    expect(listDisciplines).toHaveBeenCalledTimes(1)
    expect(loadRules).toHaveBeenCalledTimes(1)
    expect(refs.organizations.value).toEqual([{ id: 'o1', name: 'Org' }])
  })

  it('still resolves when the organizations cannot be loaded', async () => {
    listOrganizations.mockRejectedValue(new Error('forbidden'))
    const refs = useFormReferences()

    await expect(refs.loadAll()).resolves.toBeUndefined()

    expect(refs.organizations.value).toEqual([])
  })
})
