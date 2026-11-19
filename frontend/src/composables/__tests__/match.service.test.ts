import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useMatchService } from '../match/match.service'
import { matchApi } from '../match/match.api'
import { useRouter } from 'vue-router'
import { useAppToast } from '@/composables/useAppToast'
import { useParticipantService } from '../participant.service'
import type {
  ClientMatchModel as MatchModel,
  ClientMatchDetail,
  CreateMatchRequestData,
  UpdateMatchRequestData,
  ReportMatchResultRequestData,
  ConfirmMatchRequestData,
  PaginatedMatchCards,
  ValidateMatchRequestData,
} from '@skol-arena/shared/types/index'

vi.mock('@/config/ApiConfig', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))
// Only useI18n is swapped: the socket the service subscribes to pulls in the app's
// real i18n instance, which needs createI18n to still exist.
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}))
vi.mock('../match/match.api')
vi.mock('vue-router')
vi.mock('@/composables/useAppToast')
vi.mock('../participant.service')

describe('useMatchService', () => {
  const mockRouter = {
    push: vi.fn(),
  }
  const mockToast = {
    add: vi.fn(),
    remove: vi.fn(),
    removeGroup: vi.fn(),
    removeAllGroups: vi.fn(),
  }
  const mockParticipantService = {
    getTournamentParticipants: vi.fn().mockResolvedValue([]),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useRouter).mockReturnValue(mockRouter as unknown as ReturnType<typeof useRouter>)
    vi.mocked(useAppToast).mockReturnValue(mockToast as unknown as ReturnType<typeof useAppToast>)
    vi.mocked(useParticipantService).mockReturnValue(
      mockParticipantService as unknown as ReturnType<typeof useParticipantService>,
    )
  })

  describe('createMatch', () => {
    it('should call matchApi.create with correct data', async () => {
      const mockMatch: MatchModel = {
        id: 'match-1',
        tournamentId: 'tournament-1',
        status: 'scheduled',
      } as MatchModel

      vi.mocked(matchApi.create).mockResolvedValue(mockMatch)

      const { createMatch } = useMatchService()
      const input: CreateMatchRequestData = {
        tournamentId: 'tournament-1',
        sides: [
          { position: 1, playerIds: ['user-1'] },
          { position: 2, playerIds: ['user-2'] },
        ],
      }

      const result = await createMatch(input)

      expect(matchApi.create).toHaveBeenCalledWith(input)
      expect(result).toEqual(mockMatch)
    })
  })

  describe('getMatch', () => {
    it('should call matchApi.getById with correct id', async () => {
      const mockMatch = {
        id: 'match-1',
        tournamentId: 'tournament-1',
      } as ClientMatchDetail

      vi.mocked(matchApi.getById).mockResolvedValue(mockMatch)

      const { getMatch } = useMatchService()
      const result = await getMatch('match-1')

      expect(matchApi.getById).toHaveBeenCalledWith('match-1')
      expect(result).toEqual(mockMatch)
    })
  })

  describe('listMatches', () => {
    it('should call matchApi.list with filters', async () => {
      const mockResult: PaginatedMatchCards = { data: [], total: 0, hasMore: false }

      vi.mocked(matchApi.list).mockResolvedValue(mockResult)

      const { listMatches } = useMatchService()
      const filters = { tournamentId: 'tournament-1' }
      const result = await listMatches(filters)

      expect(matchApi.list).toHaveBeenCalledWith(filters)
      expect(result).toEqual(mockResult)
    })

    it('should call matchApi.list without filters', async () => {
      const mockResult: PaginatedMatchCards = { data: [], total: 0, hasMore: false }

      vi.mocked(matchApi.list).mockResolvedValue(mockResult)

      const { listMatches } = useMatchService()
      const result = await listMatches()

      expect(matchApi.list).toHaveBeenCalledWith(undefined)
      expect(result).toEqual(mockResult)
    })
  })

  describe('updateMatch', () => {
    it('should call matchApi.update with correct data', async () => {
      const mockMatch: MatchModel = {
        id: 'match-1',
        status: 'reported',
      } as MatchModel

      vi.mocked(matchApi.update).mockResolvedValue(mockMatch)

      const { updateMatch } = useMatchService()
      const input: UpdateMatchRequestData = { status: 'reported', playedAt: new Date().toISOString() }
      const result = await updateMatch('match-1', input)

      expect(matchApi.update).toHaveBeenCalledWith('match-1', input)
      expect(result).toEqual(mockMatch)
    })
  })

  describe('deleteMatch', () => {
    it('should call matchApi.delete with correct id', async () => {
      vi.mocked(matchApi.delete).mockResolvedValue({
        success: true,
        message: 'Match deleted',
      })

      const { deleteMatch } = useMatchService()
      await deleteMatch('match-1')

      expect(matchApi.delete).toHaveBeenCalledWith('match-1')
    })
  })

  describe('reportMatchResult', () => {
    it('should call matchApi.reportResult with correct data', async () => {
      const mockMatch: MatchModel = {
        id: 'match-1',
        status: 'reported',
        scoreA: 2,
        scoreB: 1,
      } as MatchModel

      vi.mocked(matchApi.reportResult).mockResolvedValue(mockMatch)

      const { reportMatchResult } = useMatchService()
      const input: ReportMatchResultRequestData = {
        scoreA: 2,
        scoreB: 1,
      }
      const result = await reportMatchResult('match-1', input)

      expect(matchApi.reportResult).toHaveBeenCalledWith('match-1', input)
      expect(result).toEqual(mockMatch)
    })
  })

  describe('confirmMatchResult', () => {
    it('should call matchApi.confirmResult with correct data', async () => {
      const mockMatch: MatchModel = {
        id: 'match-1',
        status: 'confirmed',
      } as MatchModel

      vi.mocked(matchApi.confirmResult).mockResolvedValue(mockMatch)

      const { confirmMatchResult } = useMatchService()
      const input: ConfirmMatchRequestData = {}
      const result = await confirmMatchResult('match-1', input)

      expect(matchApi.confirmResult).toHaveBeenCalledWith('match-1', input)
      expect(result).toEqual(mockMatch)
    })
  })

  describe('canProceedToNextStep', () => {
    it('false as long as no validation has happened', () => {
      const service = useMatchService()
      expect(service.canProceedToNextStep('participants', ['user-1'], ['user-2'])).toBe(false)
    })

    it('teams mode: only validationResult.valid counts', () => {
      const service = useMatchService()
      service.validationResult.value = { valid: true, errors: [], warnings: [] }
      expect(service.canProceedToNextStep('teams', [], [], 'team-a', 'team-b')).toBe(true)

      service.validationResult.value = { valid: false, errors: ['x'], warnings: [] }
      expect(service.canProceedToNextStep('teams', [], [], 'team-a', 'team-b')).toBe(false)
    })

    it('players mode: requires players on both sides', () => {
      const service = useMatchService()
      service.validationResult.value = { valid: true, errors: [], warnings: [] }
      expect(service.canProceedToNextStep('participants', ['user-1'], [])).toBe(false)
      expect(service.canProceedToNextStep('participants', [], ['user-2'])).toBe(false)
      expect(service.canProceedToNextStep('participants', ['user-1'], ['user-2'])).toBe(true)
    })

    it('a single team id is not enough to switch to teams mode', () => {
      const service = useMatchService()
      service.validationResult.value = { valid: true, errors: [], warnings: [] }
      expect(service.canProceedToNextStep('teams', [], [], 'team-a', undefined)).toBe(false)
    })
  })

  describe('canCreateMatch', () => {
    function serviceWithValidation(valid = true) {
      const service = useMatchService()
      service.validationResult.value = { valid, errors: [], warnings: [] }
      return service
    }

    it('false without a successful validation', () => {
      const service = serviceWithValidation(false)
      expect(service.canCreateMatch('reported', null, 2, 1)).toBe(false)
    })

    it('scheduled with no date → false, with a date → true', () => {
      const service = serviceWithValidation()
      expect(service.canCreateMatch('scheduled', null, 0, 0)).toBe(false)
      expect(service.canCreateMatch('scheduled', new Date(), 0, 0)).toBe(true)
    })

    it('reported with a negative score → false', () => {
      const service = serviceWithValidation()
      expect(service.canCreateMatch('reported', null, -1, 2)).toBe(false)
      expect(service.canCreateMatch('reported', null, 2, -1)).toBe(false)
      expect(service.canCreateMatch('reported', null, 2, 1)).toBe(true)
    })
  })

  describe('validateParticipants', () => {
    it('remembers the result for progression checks', async () => {
      vi.mocked(matchApi.validate).mockResolvedValue({ valid: true, errors: [], warnings: [] })

      const service = useMatchService()
      await service.validateParticipants('tournament-1', ['user-1', 'user-2'])

      expect(service.validationResult.value?.valid).toBe(true)
    })

    it('produces an invalid result when the API fails', async () => {
      vi.mocked(matchApi.validate).mockRejectedValue(new Error('network'))

      const service = useMatchService()
      const result = await service.validateParticipants('tournament-1', ['user-1'])

      expect(result.valid).toBe(false)
      expect(result.errors).toEqual(['matchService.errors.validationFailed'])
      expect(service.validationResult.value).toEqual(result)
    })
  })

  describe('validateMatch', () => {
    it('should call matchApi.validate with correct data', async () => {
      const mockValidation = {
        valid: true,
        errors: [],
        warnings: [],
      }

      vi.mocked(matchApi.validate).mockResolvedValue(mockValidation)

      const { validateMatch } = useMatchService()
      const input: ValidateMatchRequestData = {
        tournamentId: 'tournament-1',
        sides: [
          { position: 1, playerIds: ['user-1'] },
          { position: 2, playerIds: ['user-2'] },
        ],
      }
      const result = await validateMatch(input)

      expect(matchApi.validate).toHaveBeenCalledWith(input)
      expect(result).toEqual(mockValidation)
    })
  })
})
