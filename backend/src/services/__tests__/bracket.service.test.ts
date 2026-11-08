/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, mock } from "bun:test";
import { BracketService } from "../bracket.service";
import { runWithLang } from "../../utils/i18n-context";
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
  ConflictError,
} from "../../types/errors";

// Mock dependencies
const mockBracketRepository = {
  getConfigByTournamentId: mock(() => Promise.resolve(null)),
  deleteAllBracketData: mock(() => Promise.resolve()),
  createConfig: mock((config: any) =>
    Promise.resolve({ id: "bracket-config-1", ...config }),
  ),
  createSeeds: mock(() => Promise.resolve()),
  getBracketDataByTournamentId: mock(() => Promise.resolve(null)),
  createRounds: mock((rounds: any[]) =>
    Promise.resolve(rounds.map((r, i) => ({ id: `round-${i}`, ...r }))),
  ),
  createMatchMetadata: mock(() => Promise.resolve()),
  updateMatchMetadata: mock(() => Promise.resolve()),
};

const mockTournamentRepository = {
  getById: mock(() =>
    Promise.resolve({
      id: "tournament-1",
      mode: "bracket",
      status: "open",
      disciplineId: "discipline-1",
      startDate: new Date("2026-01-20"),
    }),
  ),
};

const mockEntryRepository = {
  getByTournament: mock(() =>
    Promise.resolve([
      { id: "entry-1", name: "Entry 1" },
      { id: "entry-2", name: "Entry 2" },
      { id: "entry-3", name: "Entry 3" },
      { id: "entry-4", name: "Entry 4" },
    ]),
  ),
  create: mock((_data: any, _tx?: any) =>
    Promise.resolve({ id: "new-entry", ..._data }),
  ),
  getById: mock(() => Promise.resolve(undefined)),
  getOrCreateForMatch: mock(() => Promise.resolve({ id: "new-entry" })),
  findExistingEntry: mock(() => Promise.resolve(undefined)),
  getByPlayerId: mock(() => Promise.resolve([])),
  isPlayerInEntry: mock(() => Promise.resolve(false)),
};

// Mock participants that will be converted to entries
const mockParticipantRepository = {
  findTournamentParticipants: mock(() =>
    Promise.resolve([
      { userId: "user-1", tournamentId: "tournament-1" },
      { userId: "user-2", tournamentId: "tournament-1" },
      { userId: "user-3", tournamentId: "tournament-1" },
      { userId: "user-4", tournamentId: "tournament-1" },
    ]),
  ),
};

const mockMatchRepository = {
  list: mock(() => Promise.resolve([])),
  create: mock(() => Promise.resolve("match-1")),
  getById: mock(() => Promise.resolve(undefined)),
  getByIdSimple: mock(() => Promise.resolve(undefined)),
  update: mock(() => Promise.resolve({ id: "match-1" })),
  delete: mock(() => Promise.resolve()),
  countByTournament: mock(() => Promise.resolve(0)),
  countMatchesForUser: mock(() => Promise.resolve(0)),
  countMatchesForTeam: mock(() => Promise.resolve(0)),
  countMatchesTeamsVsTeam: mock(() => Promise.resolve(0)),
  isUserInMatch: mock(() => Promise.resolve(false)),
  getTournament: mock(() => Promise.resolve(undefined)),
  validateEntriesForTournament: mock(() => Promise.resolve(undefined)),
  getParticipationsByMatchId: mock(() => Promise.resolve([])),
  findMatchesWithSameEntries: mock(() => Promise.resolve([])),
  getMatchesPendingFinalization: mock(() => Promise.resolve([])),
};

const mockStandingsService = {
  getOfficialStandings: mock(() =>
    Promise.resolve({
      standings: [
        { id: "entry-1", points: 100 },
        { id: "entry-2", points: 80 },
        { id: "entry-3", points: 60 },
        { id: "entry-4", points: 40 },
      ],
    }),
  ),
};

const mockTournamentService = {
  canManageTournament: mock(() => Promise.resolve(true)),
};

const mockInsert = {
  values: mock((values: any) => ({
    returning: mock(() => Promise.resolve([{ id: "match-1", ...values }])),
  })),
};

// Default entries returned by tx.query.tournamentEntries.findMany
let mockEntriesForQuery = [
  { id: "entry-1", name: "Entry 1", players: [{ playerId: "user-1" }] },
  { id: "entry-2", name: "Entry 2", players: [{ playerId: "user-2" }] },
  { id: "entry-3", name: "Entry 3", players: [{ playerId: "user-3" }] },
  { id: "entry-4", name: "Entry 4", players: [{ playerId: "user-4" }] },
];

const mockDb = {
  transaction: mock(async (callback: any) => {
    const tx = {
      insert: mock(() => mockInsert),
      query: {
        tournamentEntries: {
          findMany: mock(() => Promise.resolve(mockEntriesForQuery)),
        },
      },
    };
    return await callback(tx);
  }),
};

// Smart proxy for `db` that routes to PGlite when setTestDatabase() is called
// by integration test files that run in the same Bun process.
let _activeMockDb: any = mockDb;
const proxyDb = new Proxy({} as any, {
  get(_target, prop) {
    return (_activeMockDb as any)[prop];
  },
});

// Mock modules
mock.module("../../repository/bracket.repository", () => ({
  bracketRepository: mockBracketRepository,
}));

mock.module("../../repository/tournament.repository", () => ({
  tournamentRepository: mockTournamentRepository,
}));

mock.module("../../repository/entry.repository", () => ({
  entryRepository: mockEntryRepository,
}));

mock.module("../../repository/participant.repository", () => ({
  participantRepository: mockParticipantRepository,
}));

mock.module("../../repository/match.repository", () => ({
  matchRepository: mockMatchRepository,
}));

mock.module("../standings.service", () => ({
  standingsService: mockStandingsService,
}));

mock.module("../../repository/standings.repository", () => ({
  standingsRepository: {
    getMatchesForStandings: mock(() => Promise.resolve([])),
    getMatchSides: mock(() => Promise.resolve([])),
  },
}));

mock.module("../tournament.service", () => ({
  tournamentService: mockTournamentService,
}));

mock.module("../notification.service", () => ({
  notificationService: {
    deleteActionsByMatchId: mock(() => Promise.resolve()),
    deleteActionsByMatchIdForUser: mock(() => Promise.resolve()),
  },
}));

mock.module("../../config/database", () => ({
  db: proxyDb,
  setTestDatabase: (db: any) => {
    _activeMockDb = db;
  },
  resetDatabase: () => {
    _activeMockDb = mockDb;
  },
}));

describe("BracketService", () => {
  let bracketService: BracketService;

  beforeEach(() => {
    bracketService = new BracketService();
    // Reset all mocks
    mockBracketRepository.getConfigByTournamentId.mockClear();
    mockBracketRepository.deleteAllBracketData.mockClear();
    mockBracketRepository.createConfig.mockClear();
    mockBracketRepository.createSeeds.mockClear();
    mockBracketRepository.getBracketDataByTournamentId.mockClear();
    mockBracketRepository.createRounds.mockClear();
    mockBracketRepository.createMatchMetadata.mockClear();
    mockBracketRepository.updateMatchMetadata.mockClear();
    mockTournamentRepository.getById.mockReset();
    mockTournamentRepository.getById.mockResolvedValue({
      id: "tournament-1",
      mode: "bracket",
      status: "open",
      disciplineId: "discipline-1",
      startDate: new Date("2026-01-20"),
    });
    mockEntryRepository.getByTournament.mockClear();
    mockEntryRepository.create.mockClear();
    mockParticipantRepository.findTournamentParticipants.mockReset();
    mockParticipantRepository.findTournamentParticipants.mockResolvedValue([]);
    mockMatchRepository.list.mockClear();
    mockStandingsService.getOfficialStandings.mockClear();
    mockTournamentService.canManageTournament.mockClear();
    mockDb.transaction.mockClear();
    mockInsert.values.mockClear();
    // Reset default entries for tx.query
    mockEntriesForQuery = [
      { id: "entry-1", name: "Entry 1", players: [{ playerId: "user-1" }] },
      { id: "entry-2", name: "Entry 2", players: [{ playerId: "user-2" }] },
      { id: "entry-3", name: "Entry 3", players: [{ playerId: "user-3" }] },
      { id: "entry-4", name: "Entry 4", players: [{ playerId: "user-4" }] },
    ];
  });

  describe("getBracketData", () => {
    it("should return bracket data for a tournament", async () => {
      const mockData = {
        config: {} as any,
        rounds: [],
        matches: [],
        seeds: [],
      };
      mockBracketRepository.getBracketDataByTournamentId.mockResolvedValue(
        mockData as any,
      );

      const result = await bracketService.getBracketData("tournament-1");

      expect(result).toBe(mockData);
      expect(
        mockBracketRepository.getBracketDataByTournamentId,
      ).toHaveBeenCalledWith("tournament-1");
    });
  });

  describe("canGenerateBracket", () => {
    it("should return false if tournament not found", async () => {
      mockTournamentRepository.getById.mockResolvedValue(null as any);

      const result = await bracketService.canGenerateBracket("tournament-1");

      expect(result.canGenerate).toBe(false);
      expect(result.reason).toBe("Tournament not found");
    });

    it("should return false if tournament is not in bracket mode", async () => {
      mockTournamentRepository.getById.mockResolvedValue({
        id: "tournament-1",
        mode: "league",
        status: "open",
        disciplineId: "discipline-1",
        startDate: new Date("2026-01-20"),
      } as any);

      const result = await bracketService.canGenerateBracket("tournament-1");

      expect(result.canGenerate).toBe(false);
      expect(result.reason).toBe("Tournament must be in bracket mode");
    });

    it("should return false if tournament status is not open or ongoing", async () => {
      mockTournamentRepository.getById.mockResolvedValue({
        id: "tournament-1",
        mode: "bracket",
        status: "finished",
        disciplineId: "discipline-1",
        startDate: new Date("2026-01-20"),
      } as any);

      const result = await bracketService.canGenerateBracket("tournament-1");

      expect(result.canGenerate).toBe(false);
      expect(result.reason).toBe("Tournament must be open or ongoing");
    });

    it("should return false if there are confirmed matches", async () => {
      mockTournamentRepository.getById.mockResolvedValue({
        id: "tournament-1",
        mode: "bracket",
        status: "open",
        disciplineId: "discipline-1",
        startDate: new Date("2026-01-20"),
      } as any);
      mockMatchRepository.list.mockResolvedValue([
        { id: "match-1", status: "confirmed" },
      ] as any);

      const result = await bracketService.canGenerateBracket("tournament-1");

      expect(result.canGenerate).toBe(false);
      expect(result.reason).toBe(
        "Cannot regenerate: matches already finalized/confirmed",
      );
    });

    it("should return true if bracket can be generated", async () => {
      mockTournamentRepository.getById.mockResolvedValue({
        id: "tournament-1",
        mode: "bracket",
        status: "open",
        disciplineId: "discipline-1",
        startDate: new Date("2026-01-20"),
      } as any);
      mockMatchRepository.list.mockResolvedValue([
        { id: "match-1", status: "scheduled" },
      ] as any);

      const result = await bracketService.canGenerateBracket("tournament-1");

      expect(result.canGenerate).toBe(true);
      expect(result.matchCount).toBe(1);
    });
  });

  describe("deleteBracket", () => {
    it("should throw ForbiddenError if user cannot manage tournament", async () => {
      mockTournamentService.canManageTournament.mockResolvedValue(false);

      await expect(
        bracketService.deleteBracket("tournament-1", "user-1"),
      ).rejects.toThrow(ForbiddenError);
    });

    it("should delete bracket if user can manage tournament", async () => {
      mockTournamentService.canManageTournament.mockResolvedValue(true);

      await bracketService.deleteBracket("tournament-1", "user-1");

      expect(mockBracketRepository.deleteAllBracketData).toHaveBeenCalledWith(
        "tournament-1",
      );
    });
  });

  describe("generateBracket", () => {
    const defaultInput = {
      bracketType: "single_elimination" as const,
      seedingType: "random" as const,
      hasBronzeMatch: false,
    };

    it("should throw ForbiddenError if user cannot manage tournament", async () => {
      mockTournamentService.canManageTournament.mockResolvedValue(false);

      await expect(
        bracketService.generateBracket("tournament-1", defaultInput, "user-1"),
      ).rejects.toThrow(ForbiddenError);
    });

    it("should throw NotFoundError if tournament not found", async () => {
      mockTournamentService.canManageTournament.mockResolvedValue(true);
      mockTournamentRepository.getById.mockResolvedValue(null as any);

      await expect(
        bracketService.generateBracket("tournament-1", defaultInput, "user-1"),
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw BadRequestError if tournament mode is not bracket", async () => {
      mockTournamentService.canManageTournament.mockResolvedValue(true);
      mockTournamentRepository.getById.mockResolvedValue({
        id: "tournament-1",
        mode: "league",
        status: "open",
        disciplineId: "discipline-1",
        startDate: new Date("2026-01-20"),
      } as any);

      await expect(
        bracketService.generateBracket("tournament-1", defaultInput, "user-1"),
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw BadRequestError if tournament status is invalid", async () => {
      mockTournamentService.canManageTournament.mockResolvedValue(true);
      mockTournamentRepository.getById.mockResolvedValue({
        id: "tournament-1",
        mode: "bracket",
        status: "finished",
        disciplineId: "discipline-1",
        startDate: new Date("2026-01-20"),
      } as any);

      await expect(
        bracketService.generateBracket("tournament-1", defaultInput, "user-1"),
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw ConflictError if bracket cannot be regenerated", async () => {
      mockTournamentService.canManageTournament.mockResolvedValue(true);
      mockTournamentRepository.getById.mockResolvedValue({
        id: "tournament-1",
        mode: "bracket",
        status: "open",
        disciplineId: "discipline-1",
        startDate: new Date("2026-01-20"),
      } as any);
      mockMatchRepository.list.mockResolvedValue([
        { id: "match-1", status: "confirmed" },
      ] as any);

      await expect(
        bracketService.generateBracket("tournament-1", defaultInput, "user-1"),
      ).rejects.toThrow(ConflictError);
    });

    it("should throw BadRequestError if less than 2 participants", async () => {
      mockTournamentService.canManageTournament.mockResolvedValue(true);
      mockTournamentRepository.getById.mockResolvedValue({
        id: "tournament-1",
        mode: "bracket",
        status: "open",
        disciplineId: "discipline-1",
        startDate: new Date("2026-01-20"),
      } as any);
      mockMatchRepository.list.mockResolvedValue([]);
      mockEntryRepository.getByTournament.mockResolvedValue([
        { id: "entry-1", name: "Entry 1" } as any,
      ]);
      // Also set the entries returned by tx.query (used in getOrCreateEntriesFromParticipants)
      mockEntriesForQuery = [
        { id: "entry-1", name: "Entry 1", players: [{ playerId: "user-1" }] },
      ];
      mockParticipantRepository.findTournamentParticipants.mockResolvedValue([
        { userId: "user-1", tournamentId: "tournament-1" },
      ]);

      await expect(
        bracketService.generateBracket("tournament-1", defaultInput, "user-1"),
      ).rejects.toThrow(BadRequestError);
    });

    it("should generate single elimination bracket with random seeding", async () => {
      mockTournamentService.canManageTournament.mockResolvedValue(true);
      mockTournamentRepository.getById.mockResolvedValue({
        id: "tournament-1",
        mode: "bracket",
        status: "open",
        disciplineId: "discipline-1",
        startDate: new Date("2026-01-20"),
      } as any);
      mockMatchRepository.list.mockResolvedValue([]);
      mockEntryRepository.getByTournament.mockResolvedValue([
        { id: "entry-1", name: "Entry 1" },
        { id: "entry-2", name: "Entry 2" },
        { id: "entry-3", name: "Entry 3" },
        { id: "entry-4", name: "Entry 4" },
      ] as any);

      await bracketService.generateBracket(
        "tournament-1",
        defaultInput,
        "user-1",
      );

      expect(mockBracketRepository.createConfig).toHaveBeenCalled();
      expect(mockBracketRepository.createSeeds).toHaveBeenCalled();
      expect(mockBracketRepository.createRounds).toHaveBeenCalled();
    });

    it("should generate bracket with bronze match when requested", async () => {
      mockTournamentService.canManageTournament.mockResolvedValue(true);
      mockTournamentRepository.getById.mockResolvedValue({
        id: "tournament-1",
        mode: "bracket",
        status: "open",
        disciplineId: "discipline-1",
        startDate: new Date("2026-01-20"),
      } as any);
      mockMatchRepository.list.mockResolvedValue([]);
      mockEntryRepository.getByTournament.mockResolvedValue([
        { id: "entry-1", name: "Entry 1" },
        { id: "entry-2", name: "Entry 2" },
        { id: "entry-3", name: "Entry 3" },
        { id: "entry-4", name: "Entry 4" },
      ] as any);

      const input = {
        ...defaultInput,
        hasBronzeMatch: true,
      };

      await bracketService.generateBracket("tournament-1", input, "user-1");

      const configCall = mockBracketRepository.createConfig.mock.calls[0][0];
      expect(configCall.hasBronzeMatch).toBe(true);
    });

    it("should generate double elimination bracket", async () => {
      mockTournamentService.canManageTournament.mockResolvedValue(true);
      mockTournamentRepository.getById.mockResolvedValue({
        id: "tournament-1",
        mode: "bracket",
        status: "open",
        disciplineId: "discipline-1",
        startDate: new Date("2026-01-20"),
      } as any);
      mockMatchRepository.list.mockResolvedValue([]);
      mockEntryRepository.getByTournament.mockResolvedValue([
        { id: "entry-1", name: "Entry 1" },
        { id: "entry-2", name: "Entry 2" },
        { id: "entry-3", name: "Entry 3" },
        { id: "entry-4", name: "Entry 4" },
      ] as any);

      const input = {
        ...defaultInput,
        bracketType: "double_elimination" as const,
      };

      await bracketService.generateBracket("tournament-1", input, "user-1");

      const configCall = mockBracketRepository.createConfig.mock.calls[0][0];
      expect(configCall.bracketType).toBe("double_elimination");
    });

    it("should generate bracket with championship seeding", async () => {
      mockTournamentService.canManageTournament.mockResolvedValue(true);
      // First call in validateBracketGeneration
      // Second call in canGenerateBracket (inside validateBracketGeneration)
      // Third call in validateChampionshipSeeding
      mockTournamentRepository.getById
        .mockResolvedValueOnce({
          id: "tournament-1",
          mode: "bracket",
          status: "open",
          disciplineId: "discipline-1",
          startDate: new Date("2026-01-20"),
        })
        .mockResolvedValueOnce({
          id: "tournament-1",
          mode: "bracket",
          status: "open",
          disciplineId: "discipline-1",
          startDate: new Date("2026-01-20"),
        })
        .mockResolvedValueOnce({
          id: "source-tournament",
          mode: "bracket",
          status: "finished",
          disciplineId: "discipline-1",
          startDate: new Date("2026-01-15"),
        } as any);
      mockMatchRepository.list.mockResolvedValue([]);
      mockEntryRepository.getByTournament.mockResolvedValue([
        { id: "entry-1", name: "Entry 1" },
        { id: "entry-2", name: "Entry 2" },
        { id: "entry-3", name: "Entry 3" },
        { id: "entry-4", name: "Entry 4" },
      ] as any);

      const input = {
        ...defaultInput,
        seedingType: "championship_based" as const,
        sourceTournamentId: "source-tournament",
      };

      await bracketService.generateBracket("tournament-1", input, "user-1");

      expect(mockStandingsService.getOfficialStandings).toHaveBeenCalledWith(
        "source-tournament",
      );
    });

    it("should throw NotFoundError if source tournament not found for championship seeding", async () => {
      mockTournamentService.canManageTournament.mockResolvedValue(true);
      mockTournamentRepository.getById
        .mockResolvedValueOnce({
          id: "tournament-1",
          mode: "bracket",
          status: "open",
          disciplineId: "discipline-1",
          startDate: new Date("2026-01-20"),
        } as any)
        .mockResolvedValueOnce({
          id: "tournament-1",
          mode: "bracket",
          status: "open",
          disciplineId: "discipline-1",
          startDate: new Date("2026-01-20"),
        } as any)
        .mockResolvedValueOnce(null as any); // Source tournament not found
      mockMatchRepository.list.mockResolvedValue([]);

      const input = {
        ...defaultInput,
        seedingType: "championship_based" as const,
        sourceTournamentId: "source-tournament",
      };

      await expect(
        bracketService.generateBracket("tournament-1", input, "user-1"),
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw BadRequestError if source tournament is not finished", async () => {
      mockTournamentService.canManageTournament.mockResolvedValue(true);
      mockTournamentRepository.getById
        .mockResolvedValueOnce({
          id: "tournament-1",
          mode: "bracket",
          status: "open",
          disciplineId: "discipline-1",
          startDate: new Date("2026-01-20"),
        } as any)
        .mockResolvedValueOnce({
          id: "tournament-1",
          mode: "bracket",
          status: "open",
          disciplineId: "discipline-1",
          startDate: new Date("2026-01-20"),
        } as any)
        .mockResolvedValueOnce({
          id: "source-tournament",
          mode: "bracket",
          status: "ongoing",
          disciplineId: "discipline-1",
          startDate: new Date("2026-01-15"),
        } as any);
      mockMatchRepository.list.mockResolvedValue([]);

      const input = {
        ...defaultInput,
        seedingType: "championship_based" as const,
        sourceTournamentId: "source-tournament",
      };

      await expect(
        bracketService.generateBracket("tournament-1", input, "user-1"),
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw BadRequestError if disciplines do not match", async () => {
      mockTournamentService.canManageTournament.mockResolvedValue(true);
      mockTournamentRepository.getById
        .mockResolvedValueOnce({
          id: "tournament-1",
          mode: "bracket",
          status: "open",
          disciplineId: "discipline-1",
          startDate: new Date("2026-01-20"),
        } as any)
        .mockResolvedValueOnce({
          id: "tournament-1",
          mode: "bracket",
          status: "open",
          disciplineId: "discipline-1",
          startDate: new Date("2026-01-20"),
        } as any)
        .mockResolvedValueOnce({
          id: "source-tournament",
          mode: "bracket",
          status: "finished",
          disciplineId: "discipline-2",
          startDate: new Date("2026-01-15"),
        } as any);
      mockMatchRepository.list.mockResolvedValue([]);

      const input = {
        ...defaultInput,
        seedingType: "championship_based" as const,
        sourceTournamentId: "source-tournament",
      };

      await expect(
        bracketService.generateBracket("tournament-1", input, "user-1"),
      ).rejects.toThrow(BadRequestError);
    });

    it("should delete existing bracket before regenerating", async () => {
      mockTournamentService.canManageTournament.mockResolvedValue(true);
      mockTournamentRepository.getById.mockResolvedValue({
        id: "tournament-1",
        mode: "bracket",
        status: "open",
        disciplineId: "discipline-1",
        startDate: new Date("2026-01-20"),
      } as any);
      mockMatchRepository.list.mockResolvedValue([]);
      mockBracketRepository.getConfigByTournamentId.mockResolvedValue({
        id: "existing-config",
      } as any);
      mockEntryRepository.getByTournament.mockResolvedValue([
        { id: "entry-1", name: "Entry 1" },
        { id: "entry-2", name: "Entry 2" },
      ] as any);

      await bracketService.generateBracket(
        "tournament-1",
        defaultInput,
        "user-1",
      );

      expect(mockBracketRepository.deleteAllBracketData).toHaveBeenCalled();
    });
  });

  describe("Seeding Algorithms", () => {
    it("should generate random seeding with unique seed numbers", async () => {
      const entries = [
        { id: "entry-1", name: "Entry 1" },
        { id: "entry-2", name: "Entry 2" },
        { id: "entry-3", name: "Entry 3" },
        { id: "entry-4", name: "Entry 4" },
      ];

      // Access private method via type assertion
      const service = bracketService as any;
      const seeds = service.generateRandomSeeding(entries);

      expect(seeds).toHaveLength(4);
      const seedNumbers = seeds.map((s: any) => s.seedNumber);
      expect(new Set(seedNumbers).size).toBe(4);
      expect(Math.min(...seedNumbers)).toBe(1);
      expect(Math.max(...seedNumbers)).toBe(4);
    });

    it("should generate championship seeding based on standings", async () => {
      const entries = [
        { id: "entry-1", name: "Entry 1", players: [{ playerId: "player-1" }] },
        { id: "entry-2", name: "Entry 2", players: [{ playerId: "player-2" }] },
        { id: "entry-3", name: "Entry 3", players: [{ playerId: "player-3" }] },
        { id: "entry-4", name: "Entry 4", players: [{ playerId: "player-4" }] },
      ];

      mockStandingsService.getOfficialStandings.mockResolvedValue({
        standings: [
          { id: "player-4", points: 100 },
          { id: "player-2", points: 80 },
          { id: "player-1", points: 60 },
          { id: "player-3", points: 40 },
        ],
      });

      const service = bracketService as any;
      const seeds = await service.generateChampionshipSeeding(
        entries,
        "source-tournament",
      );

      expect(seeds).toHaveLength(4);
      // entry-4 should be seed 1 (highest points)
      const seed1 = seeds.find((s: any) => s.seedNumber === 1);
      expect(seed1?.entryId).toBe("entry-4");
      expect(seed1?.seedingScore).toBe(100);

      // entry-2 should be seed 2
      const seed2 = seeds.find((s: any) => s.seedNumber === 2);
      expect(seed2?.entryId).toBe("entry-2");
      expect(seed2?.seedingScore).toBe(80);
    });

    it("should handle mixed seeded and unseeded entries in championship seeding", async () => {
      const entries = [
        { id: "entry-1", name: "Entry 1", players: [{ playerId: "player-1" }] },
        { id: "entry-2", name: "Entry 2", players: [{ playerId: "player-2" }] },
        { id: "entry-3", name: "Entry 3", players: [{ playerId: "player-3" }] },
        { id: "entry-4", name: "Entry 4", players: [{ playerId: "player-4" }] },
      ];

      mockStandingsService.getOfficialStandings.mockResolvedValue({
        standings: [
          { id: "player-1", points: 100 },
          { id: "player-2", points: 80 },
        ],
      });

      const service = bracketService as any;
      const seeds = await service.generateChampionshipSeeding(
        entries,
        "source-tournament",
      );

      expect(seeds).toHaveLength(4);
      // First two should have seeding scores
      const seededEntries = seeds.filter((s: any) => s.seedingScore);
      expect(seededEntries).toHaveLength(2);

      // Last two should not have seeding scores
      const unseededEntries = seeds.filter((s: any) => !s.seedingScore);
      expect(unseededEntries).toHaveLength(2);
    });
  });

  describe("Bracket Structure Generation", () => {
    it("should generate correct number of rounds for single elimination (4 participants)", () => {
      const service = bracketService as any;
      const rounds = service.generateSingleEliminationBracket(
        [
          { entryId: "e1", seedNumber: 1 },
          { entryId: "e2", seedNumber: 2 },
          { entryId: "e3", seedNumber: 3 },
          { entryId: "e4", seedNumber: 4 },
        ],
        false,
      );

      expect(rounds).toHaveLength(2); // Semifinals + Final
      expect(rounds[0].label).toEqual({ key: "SEMI_FINALS" });
      expect(rounds[1].label).toEqual({ key: "FINAL" });
    });

    it("should generate correct number of rounds for single elimination (8 participants)", () => {
      const service = bracketService as any;
      const seeds = Array.from({ length: 8 }, (_, i) => ({
        entryId: `e${i + 1}`,
        seedNumber: i + 1,
      }));
      const rounds = service.generateSingleEliminationBracket(seeds, false);

      expect(rounds).toHaveLength(3); // Quarterfinals + Semifinals + Final
      expect(rounds[0].label).toEqual({ key: "QUARTER_FINALS" });
      expect(rounds[1].label).toEqual({ key: "SEMI_FINALS" });
      expect(rounds[2].label).toEqual({ key: "FINAL" });
    });

    it("should include bronze match when requested", () => {
      const service = bracketService as any;
      const rounds = service.generateSingleEliminationBracket(
        [
          { entryId: "e1", seedNumber: 1 },
          { entryId: "e2", seedNumber: 2 },
          { entryId: "e3", seedNumber: 3 },
          { entryId: "e4", seedNumber: 4 },
        ],
        true,
      );

      const bronzeMatch = rounds.find((r: any) => r.bracketType === "bronze");
      expect(bronzeMatch).toBeDefined();
      expect(bronzeMatch.label).toEqual({ key: "BRONZE_MATCH" });
    });

    it("should handle bye matches for non-power-of-2 participants", () => {
      const service = bracketService as any;
      const rounds = service.generateSingleEliminationBracket(
        [
          { entryId: "e1", seedNumber: 1 },
          { entryId: "e2", seedNumber: 2 },
          { entryId: "e3", seedNumber: 3 },
          { entryId: "e4", seedNumber: 4 },
          { entryId: "e5", seedNumber: 5 },
        ],
        false,
      );

      const firstRound = rounds[0];
      const byeMatches = firstRound.matches.filter((m: any) => m.isByeMatch);
      expect(byeMatches.length).toBeGreaterThan(0);
    });

    it("should generate balanced bracket pairings (1v8, 4v5, 2v7, 3v6) in correct order", () => {
      const service = bracketService as any;
      const pairings = service.generateStandardBracketPairings(8, 8);

      // Order matters: ensures #1 meets #4 in semis and #1 meets #2 only in final
      expect(pairings[0]).toEqual([1, 8]);
      expect(pairings[1]).toEqual([4, 5]);
      expect(pairings[2]).toEqual([2, 7]);
      expect(pairings[3]).toEqual([3, 6]);
    });

    it("should generate double elimination bracket with winners and losers rounds", () => {
      const service = bracketService as any;
      const rounds = service.generateDoubleEliminationBracket([
        { entryId: "e1", seedNumber: 1 },
        { entryId: "e2", seedNumber: 2 },
        { entryId: "e3", seedNumber: 3 },
        { entryId: "e4", seedNumber: 4 },
      ]);

      const winnersRounds = rounds.filter(
        (r: any) => r.bracketType === "winners",
      );
      const losersRounds = rounds.filter(
        (r: any) => r.bracketType === "losers",
      );

      expect(winnersRounds.length).toBeGreaterThan(0);
      expect(losersRounds.length).toBeGreaterThan(0);

      // Should have grand final
      const grandFinal = rounds[rounds.length - 1];
      expect(grandFinal.label).toEqual({ key: "GRAND_FINAL" });
    });
  });

  describe("Utility Methods", () => {
    it("should calculate correct rounds count for single elimination", () => {
      const service = bracketService as any;

      expect(service.calculateRoundsCount(4, "single_elimination")).toBe(2);
      expect(service.calculateRoundsCount(8, "single_elimination")).toBe(3);
      expect(service.calculateRoundsCount(16, "single_elimination")).toBe(4);
      expect(service.calculateRoundsCount(5, "single_elimination")).toBe(3);
    });

    it("should calculate correct rounds count for double elimination", () => {
      const service = bracketService as any;

      const singleElimRounds4 = 2;
      const doubleElimRounds4 =
        singleElimRounds4 + (singleElimRounds4 - 1) * 2 + 1;
      expect(service.calculateRoundsCount(4, "double_elimination")).toBe(
        doubleElimRounds4,
      );
    });

    it("should name the last rounds after their position", () => {
      const service = bracketService as any;

      expect(service.getRoundLabel(2, 3)).toEqual({ key: "FINAL" });
      expect(service.getRoundLabel(1, 3)).toEqual({ key: "SEMI_FINALS" });
      expect(service.getRoundLabel(0, 3)).toEqual({ key: "QUARTER_FINALS" });
      expect(service.getRoundLabel(0, 4)).toEqual({ key: "ROUND_OF_16" });
      expect(service.getRoundLabel(0, 5)).toEqual({ key: "ROUND_OF_32" });
    });

    it("should number the rounds of a large tournament", () => {
      const service = bracketService as any;

      // Beyond Round of 32, rounds are numbered
      expect(service.getRoundLabel(0, 7)).toEqual({
        key: "ROUND",
        params: { round: 1 },
      });
      expect(service.getRoundLabel(1, 10)).toEqual({
        key: "ROUND",
        params: { round: 2 },
      });
    });
  });

  describe("Edge Cases", () => {
    describe("Small participant counts", () => {
      /** A two-player tournament, ready for generateBracket to make a single final of. */
      function arrangeDuel() {
        mockTournamentService.canManageTournament.mockResolvedValue(true);
        mockTournamentRepository.getById.mockResolvedValue({
          id: "tournament-1",
          mode: "bracket",
          status: "open",
          disciplineId: "discipline-1",
          startDate: new Date("2026-01-20"),
        } as any);
        mockMatchRepository.list.mockResolvedValue([]);
        mockEntryRepository.getByTournament.mockResolvedValue([
          { id: "entry-1", name: "Entry 1" },
          { id: "entry-2", name: "Entry 2" },
        ] as any);
        // Also set the entries returned by tx.query (used in getOrCreateEntriesFromParticipants)
        mockEntriesForQuery = [
          { id: "entry-1", name: "Entry 1", players: [{ playerId: "user-1" }] },
          { id: "entry-2", name: "Entry 2", players: [{ playerId: "user-2" }] },
        ];
        mockParticipantRepository.findTournamentParticipants.mockResolvedValue([
          { userId: "user-1", tournamentId: "tournament-1" },
          { userId: "user-2", tournamentId: "tournament-1" },
        ]);

        return bracketService.generateBracket(
          "tournament-1",
          {
            bracketType: "single_elimination",
            seedingType: "random",
            hasBronzeMatch: false,
          },
          "user-1",
        );
      }

      it("should handle 2 participants (direct final)", async () => {
        await arrangeDuel();

        const roundsCall = mockBracketRepository.createRounds.mock.calls[0][0];
        expect(roundsCall).toHaveLength(1); // Only final
        // The key travels with the row; the rendered name is only its fallback.
        expect(roundsCall[0].roundNameKey).toBe("FINAL");
        expect(roundsCall[0].roundName).toBe("Finale");
      });

      it("should render the fallback name in the requester's language", async () => {
        await runWithLang("en", () => arrangeDuel());

        const roundsCall = mockBracketRepository.createRounds.mock.calls[0][0];
        expect(roundsCall[0].roundNameKey).toBe("FINAL");
        expect(roundsCall[0].roundName).toBe("Final");
      });

      it("should handle 3 participants with bye", async () => {
        const service = bracketService as any;
        const seeds = service.generateRandomSeeding([
          { id: "entry-1" },
          { id: "entry-2" },
          { id: "entry-3" },
        ]);
        const rounds = service.generateSingleEliminationBracket(seeds, false);

        const firstRound = rounds[0];
        const byeMatches = firstRound.matches.filter((m: any) => m.isByeMatch);
        expect(byeMatches).toHaveLength(1); // One bye for 3 participants
      });
    });

    describe("Large participant counts", () => {
      it("should handle 16 participants bracket structure", () => {
        const service = bracketService as any;
        const seeds = Array.from({ length: 16 }, (_, i) => ({
          entryId: `e${i + 1}`,
          seedNumber: i + 1,
        }));
        const rounds = service.generateSingleEliminationBracket(seeds, false);

        expect(rounds).toHaveLength(4); // R16 + QF + SF + F
        expect(rounds[0].label).toEqual({ key: "ROUND_OF_16" });
        expect(rounds[0].matchesCount).toBe(8);
        expect(rounds[1].label).toEqual({ key: "QUARTER_FINALS" });
        expect(rounds[1].matchesCount).toBe(4);
        expect(rounds[2].label).toEqual({ key: "SEMI_FINALS" });
        expect(rounds[2].matchesCount).toBe(2);
        expect(rounds[3].label).toEqual({ key: "FINAL" });
        expect(rounds[3].matchesCount).toBe(1);
      });

      it("should handle 32 participants bracket structure", () => {
        const service = bracketService as any;
        const seeds = Array.from({ length: 32 }, (_, i) => ({
          entryId: `e${i + 1}`,
          seedNumber: i + 1,
        }));
        const rounds = service.generateSingleEliminationBracket(seeds, false);

        expect(rounds).toHaveLength(5); // R32 + R16 + QF + SF + F
        expect(rounds[0].label).toEqual({ key: "ROUND_OF_32" });
        expect(rounds[0].matchesCount).toBe(16);
      });

      it("should handle 13 participants with correct byes", () => {
        const service = bracketService as any;
        const seeds = Array.from({ length: 13 }, (_, i) => ({
          entryId: `e${i + 1}`,
          seedNumber: i + 1,
        }));
        const rounds = service.generateSingleEliminationBracket(seeds, false);

        const firstRound = rounds[0];
        const byeMatches = firstRound.matches.filter((m: any) => m.isByeMatch);
        // 13 participants need 16 slots (next power of 2), so 3 byes
        expect(byeMatches).toHaveLength(3);
      });
    });

    describe("Championship seeding edge cases", () => {
      it("should handle all entries unseeded", async () => {
        const entries = [
          { id: "entry-1", name: "Entry 1", players: [{ playerId: "player-1" }] },
          { id: "entry-2", name: "Entry 2", players: [{ playerId: "player-2" }] },
          { id: "entry-3", name: "Entry 3", players: [{ playerId: "player-3" }] },
          { id: "entry-4", name: "Entry 4", players: [{ playerId: "player-4" }] },
        ];

        mockStandingsService.getOfficialStandings.mockResolvedValue({
          standings: [],
        });

        const service = bracketService as any;
        const seeds = await service.generateChampionshipSeeding(
          entries,
          "source-tournament",
        );

        expect(seeds).toHaveLength(4);
        // All should be unseeded (no seeding scores)
        const unseededEntries = seeds.filter((s: any) => !s.seedingScore);
        expect(unseededEntries).toHaveLength(4);
      });

      it("should handle all entries seeded", async () => {
        const entries = [
          { id: "entry-1", name: "Entry 1", players: [{ playerId: "player-1" }] },
          { id: "entry-2", name: "Entry 2", players: [{ playerId: "player-2" }] },
        ];

        mockStandingsService.getOfficialStandings.mockResolvedValue({
          standings: [
            { id: "player-1", points: 100 },
            { id: "player-2", points: 80 },
          ],
        });

        const service = bracketService as any;
        const seeds = await service.generateChampionshipSeeding(
          entries,
          "source-tournament",
        );

        expect(seeds).toHaveLength(2);
        // All should be seeded
        const seededEntries = seeds.filter((s: any) => s.seedingScore);
        expect(seededEntries).toHaveLength(2);
      });

      it("should handle entries with identical points in championship seeding", async () => {
        const entries = [
          { id: "entry-1", name: "Entry 1", players: [{ playerId: "player-1" }] },
          { id: "entry-2", name: "Entry 2", players: [{ playerId: "player-2" }] },
          { id: "entry-3", name: "Entry 3", players: [{ playerId: "player-3" }] },
        ];

        // Standings already sorted by tiebreakers: player-1 ranks higher than player-2 despite equal points
        mockStandingsService.getOfficialStandings.mockResolvedValue({
          standings: [
            { id: "player-1", points: 100 },
            { id: "player-2", points: 100 },
            { id: "player-3", points: 50 },
          ],
        });

        const service = bracketService as any;
        const seeds = await service.generateChampionshipSeeding(
          entries,
          "source-tournament",
        );

        expect(seeds).toHaveLength(3);
        // Both entry-1 and entry-2 should have seedingScore of 100
        const topSeeds = seeds.filter((s: any) => s.seedingScore === 100);
        expect(topSeeds).toHaveLength(2);
        // entry-1 should be seed 1, entry-2 seed 2 (standings rank preserved)
        expect(seeds.find((s: any) => s.seedNumber === 1)?.entryId).toBe("entry-1");
        expect(seeds.find((s: any) => s.seedNumber === 2)?.entryId).toBe("entry-2");
      });
    });

    describe("Match progression logic", () => {
      it("should correctly set winner progression paths in single elimination", () => {
        const service = bracketService as any;
        const rounds = service.generateSingleEliminationBracket(
          [
            { entryId: "e1", seedNumber: 1 },
            { entryId: "e2", seedNumber: 2 },
            { entryId: "e3", seedNumber: 3 },
            { entryId: "e4", seedNumber: 4 },
          ],
          false,
        );

        // First round matches should advance to next round
        const firstRound = rounds[0];
        expect(firstRound.matches[0].winnerToMatchNumber).toBe(0);
        expect(firstRound.matches[1].winnerToMatchNumber).toBe(0);

        // Final should have no winner progression
        const finalRound = rounds[rounds.length - 1];
        expect(finalRound.matches[0].winnerToMatchNumber).toBeUndefined();
      });

      it("should set winner progression for 8-participant bracket", () => {
        const service = bracketService as any;
        const seeds = Array.from({ length: 8 }, (_, i) => ({
          entryId: `e${i + 1}`,
          seedNumber: i + 1,
        }));
        const rounds = service.generateSingleEliminationBracket(seeds, false);

        // Quarterfinals (4 matches)
        const qf = rounds[0];
        expect(qf.matches[0].winnerToMatchNumber).toBe(0);
        expect(qf.matches[1].winnerToMatchNumber).toBe(0);
        expect(qf.matches[2].winnerToMatchNumber).toBe(1);
        expect(qf.matches[3].winnerToMatchNumber).toBe(1);

        // Semifinals (2 matches)
        const sf = rounds[1];
        expect(sf.matches[0].winnerToMatchNumber).toBe(0);
        expect(sf.matches[1].winnerToMatchNumber).toBe(0);
      });
    });

    describe("Bronze match special cases", () => {
      it("should not add bronze match for 2 participants", () => {
        const service = bracketService as any;
        const rounds = service.generateSingleEliminationBracket(
          [
            { entryId: "e1", seedNumber: 1 },
            { entryId: "e2", seedNumber: 2 },
          ],
          true,
        );

        const bronzeMatch = rounds.find((r: any) => r.bracketType === "bronze");
        expect(bronzeMatch).toBeUndefined();
      });

      it("should add bronze match for 4+ participants when requested", () => {
        const service = bracketService as any;
        const rounds = service.generateSingleEliminationBracket(
          [
            { entryId: "e1", seedNumber: 1 },
            { entryId: "e2", seedNumber: 2 },
            { entryId: "e3", seedNumber: 3 },
            { entryId: "e4", seedNumber: 4 },
          ],
          true,
        );

        const bronzeMatch = rounds.find((r: any) => r.bracketType === "bronze");
        expect(bronzeMatch).toBeDefined();
        expect(bronzeMatch.matchesCount).toBe(1);
      });
    });

    describe("Bracket pairings", () => {
      it("should generate correct balanced pairings for 16 participants", () => {
        const service = bracketService as any;
        const pairings = service.generateStandardBracketPairings(16, 16);

        // Balanced draw order: (1,16),(8,9),(4,13),(5,12),(2,15),(7,10),(3,14),(6,11)
        // Ensures: #1 meets #8 in QF, #4 in SF, #2 only in final
        expect(pairings).toHaveLength(8);
        expect(pairings[0]).toEqual([1, 16]);
        expect(pairings[1]).toEqual([8, 9]);
        expect(pairings[2]).toEqual([4, 13]);
        expect(pairings[3]).toEqual([5, 12]);
        expect(pairings[4]).toEqual([2, 15]);
        expect(pairings[5]).toEqual([7, 10]);
        expect(pairings[6]).toEqual([3, 14]);
        expect(pairings[7]).toEqual([6, 11]);
      });

      it("should generate pairings with ghost opponents for non-power-of-2", () => {
        const service = bracketService as any;
        const pairings = service.generateStandardBracketPairings(5, 8);

        expect(pairings).toHaveLength(4);
        // Seeds 6, 7, 8 don't exist, so they act as byes
        expect(pairings).toContainEqual([1, 8]);
        expect(pairings).toContainEqual([4, 5]);
        expect(pairings).toContainEqual([3, 6]);
        expect(pairings).toContainEqual([2, 7]);
      });
    });

    describe("getBalancedSeedPositions", () => {
      it("should return [1] for size 1", () => {
        const service = bracketService as any;
        expect(service.getBalancedSeedPositions(1)).toEqual([1]);
      });

      it("should return [1, 2] for size 2", () => {
        const service = bracketService as any;
        expect(service.getBalancedSeedPositions(2)).toEqual([1, 2]);
      });

      it("should return [1, 4, 2, 3] for size 4", () => {
        const service = bracketService as any;
        expect(service.getBalancedSeedPositions(4)).toEqual([1, 4, 2, 3]);
      });

      it("should return [1, 8, 4, 5, 2, 7, 3, 6] for size 8", () => {
        const service = bracketService as any;
        expect(service.getBalancedSeedPositions(8)).toEqual([
          1, 8, 4, 5, 2, 7, 3, 6,
        ]);
      });

      it("should always contain each number from 1 to size exactly once", () => {
        const service = bracketService as any;
        for (const size of [2, 4, 8, 16, 32]) {
          const positions = service.getBalancedSeedPositions(size);
          expect(positions).toHaveLength(size);
          expect(new Set(positions).size).toBe(size);
          expect(Math.min(...positions)).toBe(1);
          expect(Math.max(...positions)).toBe(size);
        }
      });
    });

    describe("Balanced draw property", () => {
      it("should ensure #1 and #2 can only meet in the final (8 players)", () => {
        const service = bracketService as any;
        const seeds = Array.from({ length: 8 }, (_, i) => ({
          entryId: `e${i + 1}`,
          seedNumber: i + 1,
        }));
        const rounds = service.generateSingleEliminationBracket(seeds, false);

        // Round 0 (QF): #1 vs #8, #4 vs #5, #2 vs #7, #3 vs #6
        const qf = rounds[0];
        expect(qf.matches[0].entryAId).toBe("e1");
        expect(qf.matches[0].entryBId).toBe("e8");
        expect(qf.matches[1].entryAId).toBe("e4");
        expect(qf.matches[1].entryBId).toBe("e5");
        expect(qf.matches[2].entryAId).toBe("e2");
        expect(qf.matches[2].entryBId).toBe("e7");
        expect(qf.matches[3].entryAId).toBe("e3");
        expect(qf.matches[3].entryBId).toBe("e6");

        // Match progression: QF 0 & 1 → SF 0, QF 2 & 3 → SF 1
        // If favorites win: SF 0 = #1 vs #4, SF 1 = #2 vs #3
        expect(qf.matches[0].winnerToMatchNumber).toBe(0);
        expect(qf.matches[1].winnerToMatchNumber).toBe(0);
        expect(qf.matches[2].winnerToMatchNumber).toBe(1);
        expect(qf.matches[3].winnerToMatchNumber).toBe(1);
      });

      it("should ensure #1 and #2 can only meet in the final (4 players)", () => {
        const service = bracketService as any;
        const seeds = Array.from({ length: 4 }, (_, i) => ({
          entryId: `e${i + 1}`,
          seedNumber: i + 1,
        }));
        const rounds = service.generateSingleEliminationBracket(seeds, false);

        // Semi-finals: #1 vs #4, #2 vs #3
        const sf = rounds[0];
        expect(sf.matches[0].entryAId).toBe("e1");
        expect(sf.matches[0].entryBId).toBe("e4");
        expect(sf.matches[1].entryAId).toBe("e2");
        expect(sf.matches[1].entryBId).toBe("e3");
      });
    });

    describe("Double elimination specifics", () => {
      it("should create correct number of losers rounds", () => {
        const service = bracketService as any;
        const rounds = service.generateDoubleEliminationBracket([
          { entryId: "e1", seedNumber: 1 },
          { entryId: "e2", seedNumber: 2 },
          { entryId: "e3", seedNumber: 3 },
          { entryId: "e4", seedNumber: 4 },
        ]);

        const losersRounds = rounds.filter(
          (r: any) => r.bracketType === "losers",
        );
        const winnersRounds = rounds.filter(
          (r: any) => r.bracketType === "winners",
        );

        // For 4 participants: 2 winners rounds, (2-1)*2 = 2 losers rounds, 1 grand final
        expect(winnersRounds).toHaveLength(3); // Including grand final
        expect(losersRounds).toHaveLength(2);
      });

      it("should end with grand final in double elimination", () => {
        const service = bracketService as any;
        const rounds = service.generateDoubleEliminationBracket([
          { entryId: "e1", seedNumber: 1 },
          { entryId: "e2", seedNumber: 2 },
          { entryId: "e3", seedNumber: 3 },
          { entryId: "e4", seedNumber: 4 },
          { entryId: "e5", seedNumber: 5 },
          { entryId: "e6", seedNumber: 6 },
          { entryId: "e7", seedNumber: 7 },
          { entryId: "e8", seedNumber: 8 },
        ]);

        const lastRound = rounds[rounds.length - 1];
        expect(lastRound.label).toEqual({ key: "GRAND_FINAL" });
        expect(lastRound.bracketType).toBe("winners");
        expect(lastRound.matchesCount).toBe(1);
      });
    });
  });
});
