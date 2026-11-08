import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useDisciplineService } from '../discipline.service'
import { disciplineApi } from '../discipline.api'
import { outcomeTypeApi } from '../../outcome-type.api'
import { outcomeReasonApi } from '../../outcome-reason.api'

vi.mock('vue-i18n', async () => (await import('@/test-support/mock-modules')).i18nEchoMock())
vi.mock('@/config/ApiConfig', async () => (await import('@/test-support/mock-modules')).apiConfigMock())
const toastAdd = vi.fn()
vi.mock('@/composables/useAppToast', () => ({ useAppToast: () => ({ add: toastAdd }) }))

type Service = ReturnType<typeof useDisciplineService>
type Mutation = {
  name: string
  call: (s: Service) => Promise<unknown>
  api: object
  method: string
}

const mutations: Mutation[] = [
  { name: 'createDiscipline', call: (s) => s.createDiscipline({ name: 'x' } as never), api: disciplineApi, method: 'create' },
  { name: 'updateDiscipline', call: (s) => s.updateDiscipline('d1', {} as never), api: disciplineApi, method: 'update' },
  { name: 'deleteDiscipline', call: (s) => s.deleteDiscipline('d1'), api: disciplineApi, method: 'delete' },
  { name: 'archiveDiscipline', call: (s) => s.archiveDiscipline('d1'), api: disciplineApi, method: 'archive' },
  { name: 'restoreDiscipline', call: (s) => s.restoreDiscipline('d1'), api: disciplineApi, method: 'restore' },
  { name: 'createOutcomeType', call: (s) => s.createOutcomeType({} as never), api: outcomeTypeApi, method: 'create' },
  { name: 'updateOutcomeType', call: (s) => s.updateOutcomeType('o1', {} as never), api: outcomeTypeApi, method: 'update' },
  { name: 'deleteOutcomeType', call: (s) => s.deleteOutcomeType('o1'), api: outcomeTypeApi, method: 'delete' },
  { name: 'archiveOutcomeType', call: (s) => s.archiveOutcomeType('o1'), api: outcomeTypeApi, method: 'archive' },
  { name: 'restoreOutcomeType', call: (s) => s.restoreOutcomeType('o1'), api: outcomeTypeApi, method: 'restore' },
  { name: 'createOutcomeReason', call: (s) => s.createOutcomeReason({} as never), api: outcomeReasonApi, method: 'create' },
  { name: 'updateOutcomeReason', call: (s) => s.updateOutcomeReason('r1', {} as never), api: outcomeReasonApi, method: 'update' },
  { name: 'deleteOutcomeReason', call: (s) => s.deleteOutcomeReason('r1'), api: outcomeReasonApi, method: 'delete' },
]

describe('useDisciplineService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    toastAdd.mockReset()
  })

  describe.each(mutations)('$name', ({ call, api, method }) => {
    it('confirms with a success toast and clears the loading flag', async () => {
      vi.spyOn(api as never, method as never).mockResolvedValue({ id: 'x' } as never)
      const service = useDisciplineService()

      await call(service)

      expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }))
      expect(service.loading.value).toBe(false)
      expect(service.error.value).toBeNull()
    })

    it('reports the failure, records it and rethrows', async () => {
      vi.spyOn(api as never, method as never).mockRejectedValue(new Error('nope') as never)
      const service = useDisciplineService()

      await expect(call(service)).rejects.toThrow('nope')

      expect(service.error.value).toBe('nope')
      expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error', detail: 'nope' }))
      expect(service.loading.value).toBe(false)
    })
  })

  it('falls back to a translated message when the failure is not an Error', async () => {
    vi.spyOn(disciplineApi, 'create').mockRejectedValue('weird')
    const service = useDisciplineService()

    await expect(service.createDiscipline({} as never)).rejects.toBe('weird')

    expect(service.error.value).toBe('disciplineService.errors.createFailed')
  })

  describe('listDisciplines', () => {
    it('stores the list and passes the archived flag through', async () => {
      const list = vi.spyOn(disciplineApi, 'list').mockResolvedValue([{ id: 'd1' }] as never)
      const service = useDisciplineService()

      await service.listDisciplines(true)

      expect(list).toHaveBeenCalledWith(true)
      expect(service.disciplines.value).toEqual([{ id: 'd1' }])
    })

    it('swallows a failure into the error state with a toast', async () => {
      vi.spyOn(disciplineApi, 'list').mockRejectedValue(new Error('down'))
      const service = useDisciplineService()

      await expect(service.listDisciplines()).resolves.toBeUndefined()

      expect(service.error.value).toBe('down')
      expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }))
    })
  })

  describe('getDiscipline', () => {
    it('loads the discipline and its outcome types', async () => {
      vi.spyOn(disciplineApi, 'getById').mockResolvedValue({ id: 'd1' } as never)
      const list = vi.spyOn(outcomeTypeApi, 'list').mockResolvedValue([{ id: 'o1' }] as never)
      const service = useDisciplineService()

      const result = await service.getDiscipline('d1')

      expect(result).toEqual({ id: 'd1' })
      expect(list).toHaveBeenCalledWith('d1', true)
      expect(service.outcomeTypes.value).toEqual([{ id: 'o1' }])
    })

    it('rethrows when the discipline cannot be read', async () => {
      vi.spyOn(disciplineApi, 'getById').mockRejectedValue(new Error('404'))
      const service = useDisciplineService()

      await expect(service.getDiscipline('d1')).rejects.toThrow('404')
      expect(service.error.value).toBe('404')
    })
  })

  it('keeps the current discipline in sync after an update', async () => {
    vi.spyOn(disciplineApi, 'getById').mockResolvedValue({ id: 'd1', name: 'old' } as never)
    vi.spyOn(outcomeTypeApi, 'list').mockResolvedValue([] as never)
    vi.spyOn(disciplineApi, 'update').mockResolvedValue({ id: 'd1', name: 'new' } as never)
    const service = useDisciplineService()
    await service.getDiscipline('d1')

    await service.updateDiscipline('d1', {} as never)

    expect(service.currentDiscipline.value).toEqual({ id: 'd1', name: 'new' })
  })

  it('loads outcome reasons for an outcome type', async () => {
    const list = vi.spyOn(outcomeReasonApi, 'list').mockResolvedValue([{ id: 'r1' }] as never)
    const service = useDisciplineService()

    await service.loadOutcomeReasons('o1')

    expect(list).toHaveBeenCalled()
    expect(service.outcomeReasons.value).toEqual([{ id: 'r1' }])
  })
})
