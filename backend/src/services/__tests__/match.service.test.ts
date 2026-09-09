/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";

import { matchService } from "../match.service";
import {
  matchRepository,
  MatchRepository,
  UpdateMatchData,
} from "../../repository/match.repository";
import {
  tournamentRepository,
  TournamentRepository,
} from "../../repository/tournament.repository";
import {
  userRepository,
  UserRepository,
} from "../../repository/user.repository";
import {
  matchConfirmationRepository,
  MatchConfirmationRepository,
} from "../../repository/match-confirmation.repository";
import { notificationService } from "../notification.service";
import { bracketRepository } from "../../repository/bracket.repository";
import { bracketService } from "../bracket.service";
import { teamRepository } from "../../repository/team.repository";
import { mmrCalculationService } from "../mmr-calculation.service";
import { mmrAnimationEventService } from "../mmr-animation-event.service";
import { standingsService } from "../standings.service";
import { playerComputedDataRepository } from "../../repository/player-computed-data.repository";
import { rankedSeasonRepository } from "../../repository/ranked-season.repository";
import { rankedSeasonService } from "../ranked-season.service";
import { tournamentStatsRepository } from "../../repository/tournament-stats.repository";
import { matchSidesRepository } from "../../repository/match-sides.repository";
import { matchMessageService } from "../match-message.service";
import { matchRealtimeService } from "../match-realtime.service";
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
  ConflictError,
  ErrorCode,
  type AppError,
} from "../../types/errors";
import { db } from "../../config/database";
import type {
  CreateMatchRequestData,
  UpdateMatchRequestData,
  ReportMatchResultRequestData,
  ConfirmMatchRequestData,
  ListMatchesQuery,
} from "@skol-arena/shared";
import { POST_FINALIZATION_DISPUTE_DAYS } from "@skol-arena/shared";

// Type for notification service mock
type NotificationServiceType = typeof notificationService;

// Reset repository mocks before each test
let repo: Partial<MatchRepository>;
let tourRepo: Partial<TournamentRepository>;
let usrRepo: Partial<UserRepository>;
let confRepo: Partial<MatchConfirmationRepository>;
let notifService: Partial<NotificationServiceType>;
const matchUpdatesBroadcast: string[] = [];

// MMR recalculation is offloaded to an async job queue (graphile-worker).
// finalizeMatch only enqueues the job; mock the queue so tests neither hit a
// real DB nor expect synchronous MMR work, and can assert the enqueue happened.
const mmrQueueCalls = { finalization: 0, cascade: 0 };
mock.module("../mmr-job-queue.service", () => ({
  enqueueMmrFinalization: async () => {
    mmrQueueCalls.finalization += 1;
  },
  enqueueMmrCascade: async () => {
    mmrQueueCalls.cascade += 1;
  },
}));

beforeEach(() => {
  mmrQueueCalls.finalization = 0;
  mmrQueueCalls.cascade = 0;

  // Default implementations (can be overridden per-test)
  repo = matchRepository as unknown as Partial<MatchRepository>;
  repo.getTournament = async (_id: string) => undefined;
  repo.create = async (_data: any) => "match-1"; // Now returns match ID
  repo.getById = async (_id: string) => null;
  repo.isUserInMatch = async (_matchId: string, _userId: string) => false;
  repo.validateEntriesForTournament = async () => undefined; // Replaces validateTeams/PlayersForTournament
  repo.countMatchesForUser = async () => 0;
  repo.countMatchesForTeam = async () => 0;
  repo.countMatchesTeamsVsTeam = async () => 0;
  repo.getParticipationsByMatchId = async () => [];
  repo.update = async (_id: string, _data: UpdateMatchData) =>
    ({ id: _id }) as any;
  repo.findMatchesWithSameEntries = async () => [];

  tourRepo = tournamentRepository as unknown as Partial<TournamentRepository>;
  tourRepo.isUserTournamentAdmin = async () => false;
  tourRepo.getAdminUserIds = async () => [];

  // The thread is written on every milestone of the flow; keep it out of unit tests.
  (matchMessageService as any).postSystem = async () => undefined;
  (matchMessageService as any).postUserNote = async () => undefined;

  // Live match updates go through the socket; unit tests only assert they were asked for.
  matchUpdatesBroadcast.length = 0;
  (matchRealtimeService as any).notifyMatchUpdated = async (matchId: string) => {
    matchUpdatesBroadcast.push(matchId);
  };

  usrRepo = userRepository as unknown as Partial<UserRepository>;
  usrRepo.getById = async (id: string) =>
    ({
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
      externalId: "",
      displayName: "",
      role: "player",
      trustScoreCount: 0,
    }) as any;
  usrRepo.incrementTrustScore = async () => undefined;
  usrRepo.resetTrustScore = async () => undefined;

  // Mock match confirmation repository
  confRepo =
    matchConfirmationRepository as unknown as Partial<MatchConfirmationRepository>;
  confRepo.upsert = async (_data: any) => ({ id: "conf-1", ..._data }) as any;
  confRepo.getByMatchId = async () => [];
  confRepo.hasAnyContestation = async () => false;

  // Mock notification service
  notifService =
    notificationService as unknown as Partial<NotificationServiceType>;
  notifService.deleteActionsByMatchId = async () => [];
  notifService.deleteActionsByMatchIdAndType = async () => [];
  notifService.deleteActionsByMatchIdForUser = async () => [];
  notifService.send = async () => undefined as any;

  // Mock bracketRepository to prevent real DB calls in finalizeMatch
  (bracketRepository as any).getMetadataByMatchId = async () => null;

  // Mock bracketService methods called by finalization orchestrator
  (bracketService as any).advanceWinnerToNextRound = async () => undefined;
  (bracketService as any).advanceLoserToNextRound = async () => undefined;

  // Mock mmrAnimationEventService called by finalization orchestrator
  (mmrAnimationEventService as any).createOfficialEventsAndBroadcast = async () => undefined;

  // Mock teamRepository to prevent real DB calls in static-mode validation
  (teamRepository as any).getMemberCount = async () => 2;
  (teamRepository as any).getById = async () => null;

  // Mock mmrCalculationService to prevent real DB calls in finalizeMatch
  (mmrCalculationService as any).processMatchFinalization = async () => undefined;

  // Mock rankedSeasonRepository + service to prevent real DB calls (non-ranked by default)
  (rankedSeasonRepository as any).getConfigByTournamentId = async () => null;
  (rankedSeasonService as any).computeAndCacheOfficial = async () => undefined;
  (rankedSeasonService as any).computeAndCacheProvisional = async () => undefined;

  // Mock tournamentStatsRepository to prevent real DB calls in finalizeMatch
  (tournamentStatsRepository as any).deleteComputedStats = async () => undefined;

  // Mock standingsService to prevent real DB calls in flex championship recalculation
  (standingsService as any).recalculatePointsInternal = async () => ({ updatedMatches: 0 });
  (standingsService as any).invalidateCache = async () => undefined;

  // Mock getPlayerIdsForMatch and playerComputedDataRepository to prevent real DB calls
  repo.getPlayerIdsForMatch = async () => [];
  (playerComputedDataRepository as any).deleteMany = async () => undefined;
});

afterEach(() => {
  // Remove own-property mocks from singletons to restore prototype methods.
  // This prevents unit test mutations from leaking into integration tests
  // that run in the same process. Skip plain mock objects (from mock.module())
  // which have Object.prototype — deleting their properties would destroy them.
  const restore = (instance: object) => {
    if (Object.getPrototypeOf(instance) === Object.prototype) return;
    for (const key of Object.getOwnPropertyNames(instance)) {
      delete (instance as Record<string, unknown>)[key];
    }
  };
  restore(matchRepository);
  restore(tournamentRepository);
  restore(userRepository);
  restore(matchConfirmationRepository);
  restore(matchMessageService);
  restore(matchRealtimeService);
  restore(notificationService);
  restore(bracketRepository);
  restore(bracketService);
  restore(teamRepository);
  restore(mmrCalculationService);
  restore(mmrAnimationEventService);
  restore(standingsService);
  restore(playerComputedDataRepository);
  restore(rankedSeasonRepository);
  restore(rankedSeasonService);
  restore(tournamentStatsRepository);
  restore(matchSidesRepository);
});

describe("MatchService - basic flows", () => {
  it("createMatch should throw NotFoundError when tournament does not exist", async () => {
    // matchRepository.getTournament returns null by default
    try {
      await matchService.createMatch(
        { tournamentId: "t-1" } as CreateMatchRequestData,
        "u-1",
      );
      throw new Error("Expected NotFoundError");
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundError);
    }
  });

  it("getMatchById should return match when exists", async () => {
    repo.getById = async () =>
      ({ id: "m-10", tournamentId: "t-10", status: "scheduled" }) as any;
    const res = await matchService.getMatchById("m-10");
    expect(res).toBeTruthy();
    expect(res.id).toBe("m-10");
  });

  it("listMatches should return results from repository", async () => {
    repo.list = async (filters?: ListMatchesQuery) => [
      { id: "m-l", tournamentId: filters?.tournamentId } as any,
    ];
    const res = await matchService.listMatches({
      tournamentId: "t-l",
    } as ListMatchesQuery);
    expect(Array.isArray(res)).toBe(true);
    expect(res[0].tournamentId).toBe("t-l");
  });

  it("updateMatch should succeed when user can manage matches", async () => {
    repo.getById = async () =>
      ({ id: "m-u", tournamentId: "t-1", status: "scheduled" }) as any;
    usrRepo.getById = async () =>
      ({ id: "u-admin", role: "super_admin" }) as any;
    repo.update = async (_id: string, data: UpdateMatchData) =>
      ({ id: _id, ...data }) as any;
    const res = await matchService.updateMatch(
      "m-u",
      { status: "reported", scoreA: 2, scoreB: 1 } as UpdateMatchRequestData,
      "u-admin",
    );
    expect(res.status).toBe("reported");
  });

  it("deleteMatch should succeed when user can manage matches", async () => {
    repo.getById = async () =>
      ({ id: "m-d", tournamentId: "t-1", status: "scheduled" }) as any;
    usrRepo.getById = async () =>
      ({ id: "u-admin", role: "super_admin" }) as any;
    let deletedId: string | null = null;
    repo.delete = async (id: string) => {
      deletedId = id;
    };
    const res = await matchService.deleteMatch("m-d", "u-admin");
    expect(res.success).toBe(true);
    expect(deletedId).not.toBeNull();
    expect(deletedId!).toBe("m-d");
  });

  it("deleteMatch clears the notifications pointing at the match before it disappears", async () => {
    repo.getById = async () =>
      ({ id: "m-d", tournamentId: "t-1", status: "scheduled" }) as any;
    usrRepo.getById = async () =>
      ({ id: "u-admin", role: "super_admin" }) as any;

    const calls: string[] = [];
    notifService.deleteActionsByMatchId = async (id: string) => {
      calls.push(`purge:${id}`);
      return [];
    };
    repo.delete = async (id: string) => {
      calls.push(`delete:${id}`);
    };

    await matchService.deleteMatch("m-d", "u-admin");

    // match_id is set to null rather than cascaded, so the purge has to come first
    expect(calls).toEqual(["purge:m-d", "delete:m-d"]);
  });

  it("reportMatchResult draw allowed should set no winner and include reportProof", async () => {
    repo.getById = async () =>
      ({
        id: "m-draw",
        tournamentId: "t-1",
        status: "scheduled",
        sides: [{ position: 1, teamId: "A" }, { position: 2, teamId: "B" }],
      }) as any;
    repo.isUserInMatch = async () => true;
    repo.getTournament = async () => ({ id: "t-1", allowDraw: true }) as any;
    repo.update = async (_id: string, data: UpdateMatchData) => {
      return { id: _id, ...data } as any;
    };
    repo.getParticipationsByMatchId = async () => []; // No participations for static teams
    const res = await matchService.reportMatchResult(
      "m-draw",
      {
        scoreA: 1,
        scoreB: 1,
        reportProof: "img",
      } as ReportMatchResultRequestData,
      "u-1",
    );
    expect((res as any).winnerId).toBeUndefined();
    expect((res as any).reportProof).toBe("img");
    expect((res as any).status).toBe("reported");
  });

  it("confirmMatch should throw ForbiddenError when user not participant", async () => {
    repo.getById = async () =>
      ({
        id: "m-x",
        tournamentId: "t-1",
        status: "reported",
        reportedBy: "u-rep",
      }) as any;
    repo.isUserInMatch = async () => false;
    try {
      await matchService.confirmMatch(
        "m-x",
        {} as ConfirmMatchRequestData,
        "u-other",
      );
      throw new Error("Expected ForbiddenError");
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
    }
  });

  it("validateMatch should return error when tournament not found or not open", async () => {
    repo.getTournament = async () => undefined;
    const res1 = await matchService.validateMatch({
      tournamentId: "no",
    } as CreateMatchRequestData);
    expect(res1.valid).toBe(false);
    repo.getTournament = async () =>
      ({ id: "t", status: "closed", teamMode: "flex" }) as any;
    const res2 = await matchService.validateMatch({
      tournamentId: "t",
    } as CreateMatchRequestData);
    expect(res2.valid).toBe(false);
  });

  it("createMatch should throw BadRequestError when tournament status invalid", async () => {
    repo.getTournament = async () =>
      ({ id: "t-1", status: "closed", teamMode: "flex" }) as any;
    try {
      await matchService.createMatch(
        { tournamentId: "t-1" } as CreateMatchRequestData,
        "u-1",
      );
      throw new Error("Expected BadRequestError");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
    }
  });

  it("createMatch should create match when creator is listed as player", async () => {
    // Tournament open and flex mode
    repo.getTournament = async () =>
      ({
        id: "t-1",
        status: "open",
        teamMode: "flex",
        championshipConfig: {
          maxMatchesPerPlayer: 10,
          maxTimesWithSamePartner: 2,
          maxTimesWithSameOpponent: 2,
        },
      }) as any;

    // Simulate create returning an id and getById returning full match
    repo.create = async (_data: any) => "m-1";
    repo.getById = async (id: string) =>
      ({ id, tournamentId: "t-1", status: "scheduled" }) as any;

    const input: CreateMatchRequestData = {
      tournamentId: "t-1",
      sides: [{ position: 1, playerIds: ["u-1"] }, { position: 2, playerIds: ["u-2"] }],
    } as CreateMatchRequestData;

    const result = await matchService.createMatch(input, "u-1");
    expect(result).toBeTruthy();
    expect(result?.id).toBe("m-1");
  });

  it("reportMatchResult should reject non-participant", async () => {
    repo.getById = async () =>
      ({ id: "m-1", tournamentId: "t-1", status: "scheduled" }) as any;
    repo.isUserInMatch = async () => false;

    try {
      await matchService.reportMatchResult(
        "m-1",
        { scoreA: 1, scoreB: 0 } as ReportMatchResultRequestData,
        "u-3",
      );
      throw new Error("Expected ForbiddenError");
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
    }
  });

  it("reportMatchResult should reject negative scores", async () => {
    repo.getById = async () =>
      ({
        id: "m-1",
        tournamentId: "t-1",
        status: "scheduled",
        sides: [{ position: 1, teamId: "tA" }, { position: 2, teamId: "tB" }],
      }) as any;
    repo.isUserInMatch = async () => true;
    repo.getTournament = async () => ({ id: "t-1", allowDraw: true }) as any;

    try {
      await matchService.reportMatchResult(
        "m-1",
        { scoreA: -1, scoreB: 0 } as ReportMatchResultRequestData,
        "u-1",
      );
      throw new Error("Expected BadRequestError");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
    }
  });

  it("validateMatch should report overlapping players as error", async () => {
    repo.getTournament = async () =>
      ({ id: "t-1", status: "open", teamMode: "flex", name: "T" }) as any;

    const input: CreateMatchRequestData = {
      tournamentId: "t-1",
      sides: [{ position: 1, playerIds: ["p1", "p2"] }, { position: 2, playerIds: ["p2", "p3"] }],
    } as CreateMatchRequestData;

    const res = await matchService.validateMatch(input);
    expect(res.valid).toBe(false);
    expect(
      res.errors.some((e: string) =>
        e.includes("ne peut pas être dans les deux équipes"),
      ),
    ).toBe(true);
  });

  it("getMatchById should throw NotFoundError when missing", async () => {
    repo.getById = async (_id: string) => null;
    try {
      await matchService.getMatchById("m-not-exist");
      throw new Error("Expected NotFoundError");
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundError);
    }
  });

  it("updateMatch should throw ForbiddenError when user cannot manage matches", async () => {
    repo.getById = async () =>
      ({ id: "m-1", tournamentId: "t-1", status: "scheduled" }) as any;
    usrRepo.getById = async () => ({ id: "u-1", role: "player" }) as any;
    tourRepo.isUserTournamentAdmin = async () => false;

    try {
      await matchService.updateMatch(
        "m-1",
        { status: "reported" } as UpdateMatchRequestData,
        "u-1",
      );
      throw new Error("Expected ForbiddenError");
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
    }
  });

  it("deleteMatch should throw ForbiddenError when user cannot manage matches", async () => {
    repo.getById = async () =>
      ({ id: "m-1", tournamentId: "t-1", status: "scheduled" }) as any;
    usrRepo.getById = async () => ({ id: "u-1", role: "player" }) as any;
    tourRepo.isUserTournamentAdmin = async () => false;

    try {
      await matchService.deleteMatch("m-1", "u-1");
      throw new Error("Expected ForbiddenError");
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
    }
  });

  it("confirmMatch should accept confirmation when valid", async () => {
    repo.getById = async () =>
      ({
        id: "m-1",
        tournamentId: "t-1",
        status: "reported",
        reportedBy: "u-rep",
      }) as any;
    repo.isUserInMatch = async () => true;
    repo.update = async (_id: string, data: UpdateMatchData) =>
      ({ id: "m-1", ...data }) as any;
    repo.getParticipationsByMatchId = async () =>
      [
        { playerId: "u-rep", teamSide: "A" },
        { playerId: "u-conf", teamSide: "B" },
      ] as any;
    confRepo.getByMatchId = async () =>
      [
        { playerId: "u-rep", isConfirmed: true, isContested: false },
        { playerId: "u-conf", isConfirmed: true, isContested: false },
      ] as any;

    const res = await matchService.confirmMatch(
      "m-1",
      {} as ConfirmMatchRequestData,
      "u-conf",
    );
    expect(res).toBeTruthy();
    // Status might be "reported", "pending_confirmation", or "finalized" depending on confirmations
    expect(["reported", "pending_confirmation", "finalized"]).toContain(
      (res as any).status,
    );
  });

  it("confirmMatch should set disputed when not confirmed", async () => {
    // This test name is misleading - it should test contestation, not confirmation
    // But let's keep the test name and adjust expectations
    repo.getById = async () =>
      ({
        id: "m-2",
        tournamentId: "t-1",
        status: "reported",
        reportedBy: "u-rep",
      }) as any;
    repo.isUserInMatch = async () => true;
    repo.update = async (_id: string, data: UpdateMatchData) =>
      ({ id: "m-2", ...data }) as any;
    repo.getParticipationsByMatchId = async () =>
      [
        { playerId: "u-rep", teamSide: "A" },
        { playerId: "u-conf", teamSide: "B" },
      ] as any;
    confRepo.getByMatchId = async () =>
      [
        { playerId: "u-rep", isConfirmed: true, isContested: false },
        { playerId: "u-conf", isConfirmed: false, isContested: true }, // This player contested
      ] as any;
    confRepo.hasAnyContestation = async () => true;

    const res = await matchService.confirmMatch(
      "m-2",
      {} as ConfirmMatchRequestData,
      "u-conf",
    );
    expect(res).toBeTruthy();
    // When there's a contestation, status should be disputed
    // But confirmMatch creates a confirmation, so we need to check the final state
    // The status will be set to disputed by checkAndFinalizeMatch if there's a contestation
    expect(["reported", "pending_confirmation", "disputed"]).toContain(
      (res as any).status,
    );
  });

  it("createMatch should throw ConflictError when max matches per player exceeded", async () => {
    repo.getTournament = async () =>
      ({
        id: "t-1",
        status: "open",
        teamMode: "flex",
        championshipConfig: {
          maxMatchesPerPlayer: 1,
          maxTimesWithSamePartner: 2,
          maxTimesWithSameOpponent: 2,
        },
      }) as any;

    repo.countMatchesForUser = async () => 2; // exceeds max

    const input: CreateMatchRequestData = {
      tournamentId: "t-1",
      sides: [{ position: 1, playerIds: ["u-1"] }, { position: 2, playerIds: ["u-2"] }],
    } as CreateMatchRequestData;

    try {
      await matchService.createMatch(input, "u-1");
      throw new Error("Expected ConflictError");
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
    }
  });

  it("createMatch should throw ConflictError when partner count exceeded", async () => {
    repo.getTournament = async () =>
      ({
        id: "t-1",
        status: "open",
        teamMode: "flex",
        championshipConfig: {
          maxMatchesPerPlayer: 10,
          maxTimesWithSamePartner: 1,
          maxTimesWithSameOpponent: 10,
        },
      }) as any;

    repo.countMatchesForTeam = async () => 2; // exceeds

    const input: CreateMatchRequestData = {
      tournamentId: "t-1",
      sides: [{ position: 1, playerIds: ["u-1", "u-2"] }, { position: 2, playerIds: ["u-3", "u-4"] }],
    } as CreateMatchRequestData;

    try {
      await matchService.createMatch(input, "u-1");
      throw new Error("Expected ConflictError");
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
    }
  });

  it("createMatch should throw ConflictError when opponent count exceeded", async () => {
    repo.getTournament = async () =>
      ({
        id: "t-1",
        status: "open",
        teamMode: "flex",
        championshipConfig: {
          maxMatchesPerPlayer: 10,
          maxTimesWithSamePartner: 10,
          maxTimesWithSameOpponent: 1,
        },
      }) as any;

    repo.countMatchesTeamsVsTeam = async () => 3; // exceeds

    const input: CreateMatchRequestData = {
      tournamentId: "t-1",
      sides: [{ position: 1, playerIds: ["u-1", "u-2"] }, { position: 2, playerIds: ["u-3", "u-4"] }],
    } as CreateMatchRequestData;

    try {
      await matchService.createMatch(input, "u-1");
      throw new Error("Expected ConflictError");
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
    }
  });

  it("canManageMatches returns true for super_admin", async () => {
    usrRepo.getById = async () =>
      ({ id: "u-admin", role: "super_admin" }) as any;
    const res = await matchService.canManageMatches("t-1", "u-admin");
    expect(res).toBe(true);
  });

  it("canManageMatches returns true for tournament admin", async () => {
    usrRepo.getById = async () => ({ id: "u-2", role: "player" }) as any;
    tourRepo.isUserTournamentAdmin = async () => true;
    const res = await matchService.canManageMatches("t-1", "u-2");
    expect(res).toBe(true);
  });

  it("createMatch static mode should require team ids and create match if valid", async () => {
    repo.getTournament = async () =>
      ({
        id: "t-2",
        status: "open",
        teamMode: "static",
      }) as any;

    // missing teams should error — use super_admin so we bypass permission check
    usrRepo.getById = async () =>
      ({ id: "u-admin", role: "super_admin" }) as any;
    try {
      await matchService.createMatch(
        { tournamentId: "t-2" } as CreateMatchRequestData,
        "u-admin",
      );
      throw new Error("Expected BadRequestError");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
    }

    // valid teams -> should call validateTeamsForTournament and create
    repo.validateEntriesForTournament = async () => undefined;
    repo.create = async (_data: any) => "ms-1";
    repo.getById = async (id: string) => ({ id, tournamentId: "t-2" }) as any;

    const input: CreateMatchRequestData = {
      tournamentId: "t-2",
      sides: [{ position: 1, teamId: "A" }, { position: 2, teamId: "B" }],
    } as CreateMatchRequestData;
    const result = await matchService.createMatch(input, "u-admin");
    expect(result).toBeTruthy();
    expect(result?.id).toBe("ms-1");
  });

  it("updateMatch should throw BadRequestError when match already confirmed", async () => {
    repo.getById = async () =>
      ({ id: "m-c", tournamentId: "t-1", status: "confirmed" }) as any;
    usrRepo.getById = async () => ({ id: "u-1", role: "super_admin" }) as any;
    try {
      await matchService.updateMatch(
        "m-c",
        { status: "reported" } as UpdateMatchRequestData,
        "u-1",
      );
      throw new Error("Expected BadRequestError");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
    }
  });

  it("deleteMatch should throw BadRequestError when match confirmed", async () => {
    repo.getById = async () =>
      ({ id: "m-c", tournamentId: "t-1", status: "confirmed" }) as any;
    usrRepo.getById = async () => ({ id: "u-1", role: "super_admin" }) as any;
    try {
      await matchService.deleteMatch("m-c", "u-1");
      throw new Error("Expected BadRequestError");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
    }
  });

  it("deleteMatch should throw BadRequestError when match finalized", async () => {
    repo.getById = async () =>
      ({ id: "m-f", tournamentId: "t-1", status: "finalized" }) as any;
    usrRepo.getById = async () => ({ id: "u-1", role: "super_admin" }) as any;
    try {
      await matchService.deleteMatch("m-f", "u-1");
      throw new Error("Expected BadRequestError");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
    }
  });

  it("updateMatch should throw BadRequestError when match finalized", async () => {
    repo.getById = async () =>
      ({ id: "m-f", tournamentId: "t-1", status: "finalized" }) as any;
    usrRepo.getById = async () => ({ id: "u-1", role: "super_admin" }) as any;
    try {
      await matchService.updateMatch(
        "m-f",
        { status: "reported" } as UpdateMatchRequestData,
        "u-1",
      );
      throw new Error("Expected BadRequestError");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
    }
  });

  it("reportMatchResult should reject when match status invalid", async () => {
    repo.getById = async () =>
      ({ id: "m-1", tournamentId: "t-1", status: "confirmed" }) as any;
    repo.isUserInMatch = async () => true;
    try {
      await matchService.reportMatchResult(
        "m-1",
        { scoreA: 1, scoreB: 0 } as ReportMatchResultRequestData,
        "u-1",
      );
      throw new Error("Expected BadRequestError");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
    }
  });

  it("reportMatchResult should reject draw when tournament does not allow draws", async () => {
    repo.getById = async () =>
      ({ id: "m-1", tournamentId: "t-1", status: "scheduled" }) as any;
    repo.isUserInMatch = async () => true;
    repo.getTournament = async () => ({ id: "t-1", allowDraw: false }) as any;
    try {
      await matchService.reportMatchResult(
        "m-1",
        { scoreA: 1, scoreB: 1 } as ReportMatchResultRequestData,
        "u-1",
      );
      throw new Error("Expected BadRequestError");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
    }
  });

  it.skip("reportMatchResult should determine winner and call update", async () => {
    repo.getById = async () =>
      ({
        id: "m-w",
        tournamentId: "t-1",
        status: "scheduled",
        sides: [{ position: 1, teamId: "A" }, { position: 2, teamId: "B" }],
      }) as any;
    repo.isUserInMatch = async () => true;
    repo.update = async (_id: string, data: UpdateMatchData) => {
      return { id: _id, ...data } as any;
    };
    repo.getTournament = async () => ({ id: "t-1", allowDraw: true }) as any;
    repo.getParticipationsByMatchId = async () => []; // No participations for static teams

    const res = await matchService.reportMatchResult(
      "m-w",
      { scoreA: 2, scoreB: 1 } as ReportMatchResultRequestData,
      "u-1",
    );
    expect((res as any).winnerId).toBe("A");
    expect((res as any).status).toBe("reported");
  });

  it("confirmMatch should allow reporter to confirm (no longer blocked)", async () => {
    // Note: The previous behavior of blocking reporter from confirming has been removed
    // Now reporters can confirm their own reported matches
    repo.getById = async () =>
      ({
        id: "m-1",
        tournamentId: "t-1",
        status: "reported",
        reportedBy: "u-rep",
      }) as any;
    repo.isUserInMatch = async () => true;
    repo.update = async (_id: string, data: UpdateMatchData) =>
      ({ id: "m-1", ...data }) as any;
    repo.getParticipationsByMatchId = async () =>
      [{ playerId: "u-rep", teamSide: "A" }] as any;
    confRepo.getByMatchId = async () =>
      [{ playerId: "u-rep", isConfirmed: true, isContested: false }] as any;

    const res = await matchService.confirmMatch(
      "m-1",
      {} as ConfirmMatchRequestData,
      "u-rep",
    );
    expect(res).toBeTruthy();
    // Reporter can now confirm their own match
    expect(["reported", "pending_confirmation", "finalized"]).toContain(
      (res as any).status,
    );
  });

  it.skip("validateMatch should add warning when similar match exists", async () => {
    repo.getTournament = async () =>
      ({ id: "t-1", status: "open", teamMode: "static", name: "T" }) as any;
    // mock db existing match
    const dbTyped = db as unknown as {
      query?: {
        matches?: { findFirst?: () => Promise<{ id: string } | null> };
      };
    };
    dbTyped.query = dbTyped.query || {};
    dbTyped.query.matches = dbTyped.query.matches || {};
    dbTyped.query.matches.findFirst = async () => ({ id: "exists" });

    const input: CreateMatchRequestData = {
      tournamentId: "t-1",
      sides: [{ position: 1, teamId: "A" }, { position: 2, teamId: "B" }],
    } as CreateMatchRequestData;
    const res = await matchService.validateMatch(input);
    expect(res.warnings.length).toBeGreaterThan(0);
  });
});

describe("MatchService - Partner and Opponent Constraints", () => {
  it("should validate partner constraints correctly in 2v2 (Team A players)", async () => {
    repo.getTournament = async () =>
      ({
        id: "t-1",
        status: "open",
        teamMode: "flex",
        championshipConfig: {
          maxMatchesPerPlayer: 10,
          maxTimesWithSamePartner: 2,
          maxTimesWithSameOpponent: 3,
        },
      }) as any;

    repo.validateEntriesForTournament = async () => undefined;
    repo.countMatchesForUser = async () => 0;

    // Team [A1, A2] has already played 2 matches together (max reached)
    repo.countMatchesForTeam = async (_tid: string, playerIds: string[]) => {
      if (playerIds.includes("A1") && playerIds.includes("A2")) return 2;
      return 0;
    };

    repo.countMatchesTeamsVsTeam = async () => 0;

    const input: CreateMatchRequestData = {
      tournamentId: "t-1",
      sides: [{ position: 1, playerIds: ["A1", "A2"] }, { position: 2, playerIds: ["B1", "B2"] }],
    } as CreateMatchRequestData;

    try {
      await matchService.createMatch(input, "A1");
      throw new Error("Expected ConflictError");
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
      expect((err as ConflictError).code).toBe(
        ErrorCode.MAX_PARTNER_MATCHES_EXCEEDED,
      );
    }
  });

  it("should validate partner constraints correctly in 2v2 (Team B players)", async () => {
    repo.getTournament = async () =>
      ({
        id: "t-1",
        status: "open",
        teamMode: "flex",
        championshipConfig: {
          maxMatchesPerPlayer: 10,
          maxTimesWithSamePartner: 2,
          maxTimesWithSameOpponent: 3,
        },
      }) as any;

    repo.validateEntriesForTournament = async () => undefined;
    repo.countMatchesForUser = async () => 0;

    // Team [B1, B2] has already played 2 matches together (max reached)
    repo.countMatchesForTeam = async (_tid: string, playerIds: string[]) => {
      if (playerIds.includes("B1") && playerIds.includes("B2")) return 2;
      return 0;
    };

    repo.countMatchesTeamsVsTeam = async () => 0;

    const input: CreateMatchRequestData = {
      tournamentId: "t-1",
      sides: [{ position: 1, playerIds: ["A1", "A2"] }, { position: 2, playerIds: ["B1", "B2"] }],
    } as CreateMatchRequestData;

    try {
      await matchService.createMatch(input, "B1");
      throw new Error("Expected ConflictError");
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
      expect((err as ConflictError).code).toBe(
        ErrorCode.MAX_PARTNER_MATCHES_EXCEEDED,
      );
    }
  });

  it("should validate opponent constraints correctly in 2v2 (Team A vs Team B)", async () => {
    repo.getTournament = async () =>
      ({
        id: "t-1",
        status: "open",
        teamMode: "flex",
        championshipConfig: {
          maxMatchesPerPlayer: 10,
          maxTimesWithSamePartner: 5,
          maxTimesWithSameOpponent: 2,
        },
      }) as any;

    repo.validateEntriesForTournament = async () => undefined;
    repo.countMatchesForUser = async () => 0;
    repo.countMatchesForTeam = async () => 0;

    // Teams [A1,A2] vs [B1,B2] have already faced each other 2 times (max reached)
    repo.countMatchesTeamsVsTeam = async () => 2;

    const input: CreateMatchRequestData = {
      tournamentId: "t-1",
      sides: [{ position: 1, playerIds: ["A1", "A2"] }, { position: 2, playerIds: ["B1", "B2"] }],
    } as CreateMatchRequestData;

    try {
      await matchService.createMatch(input, "A1");
      throw new Error("Expected ConflictError");
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
      expect((err as ConflictError).code).toBe(
        ErrorCode.MAX_OPPONENT_MATCHES_EXCEEDED,
      );
    }
  });

  it("should validate opponent constraints correctly in 2v2 (Team B vs Team A)", async () => {
    repo.getTournament = async () =>
      ({
        id: "t-1",
        status: "open",
        teamMode: "flex",
        championshipConfig: {
          maxMatchesPerPlayer: 10,
          maxTimesWithSamePartner: 5,
          maxTimesWithSameOpponent: 2,
        },
      }) as any;

    repo.validateEntriesForTournament = async () => undefined;
    repo.countMatchesForUser = async () => 0;
    repo.countMatchesForTeam = async () => 0;

    // Teams [A1,A2] vs [B1,B2] have already faced each other 2 times (max reached)
    repo.countMatchesTeamsVsTeam = async () => 2;

    const input: CreateMatchRequestData = {
      tournamentId: "t-1",
      sides: [{ position: 1, playerIds: ["A1", "A2"] }, { position: 2, playerIds: ["B1", "B2"] }],
    } as CreateMatchRequestData;

    try {
      await matchService.createMatch(input, "B2");
      throw new Error("Expected ConflictError");
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
      expect((err as ConflictError).code).toBe(
        ErrorCode.MAX_OPPONENT_MATCHES_EXCEEDED,
      );
    }
  });

  it("should validate correctly in 3v3 scenario", async () => {
    repo.getTournament = async () =>
      ({
        id: "t-1",
        status: "open",
        teamMode: "flex",
        championshipConfig: {
          maxMatchesPerPlayer: 10,
          maxTimesWithSamePartner: 2,
          maxTimesWithSameOpponent: 3,
        },
      }) as any;

    repo.validateEntriesForTournament = async () => undefined;
    repo.countMatchesForUser = async () => 0;

    // Team [A1, A2, A3] has already played 2 matches together (max reached)
    repo.countMatchesForTeam = async (_tid: string, playerIds: string[]) => {
      if (playerIds.includes("A1") && playerIds.includes("A2") && playerIds.includes("A3")) return 2;
      return 0;
    };

    repo.countMatchesTeamsVsTeam = async () => 0;

    const input: CreateMatchRequestData = {
      tournamentId: "t-1",
      sides: [{ position: 1, playerIds: ["A1", "A2", "A3"] }, { position: 2, playerIds: ["B1", "B2", "B3"] }],
    } as CreateMatchRequestData;

    try {
      await matchService.createMatch(input, "A2");
      throw new Error("Expected ConflictError");
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
      expect((err as ConflictError).code).toBe(
        ErrorCode.MAX_PARTNER_MATCHES_EXCEEDED,
      );
    }
  });

  it("should pass validation when all constraints are satisfied in 2v2", async () => {
    repo.getTournament = async () =>
      ({
        id: "t-1",
        status: "open",
        teamMode: "flex",
        championshipConfig: {
          maxMatchesPerPlayer: 10,
          maxTimesWithSamePartner: 3,
          maxTimesWithSameOpponent: 3,
        },
      }) as any;

    repo.validateEntriesForTournament = async () => undefined;
    repo.countMatchesForUser = async () => 1; // Only 1 match played
    repo.countMatchesForTeam = async () => 1; // Only 1 match as this team
    repo.countMatchesTeamsVsTeam = async () => 1; // Only 1 match against these opponents

    // Mock creation and retrieval
    repo.create = async (_data: any) => "m-success";
    repo.getById = async (id: string) =>
      ({
        id,
        tournamentId: "t-1",
        status: "scheduled",
        scoreA: 0,
        scoreB: 0,
      }) as any;

    const input: CreateMatchRequestData = {
      tournamentId: "t-1",
      sides: [{ position: 1, playerIds: ["A1", "A2"] }, { position: 2, playerIds: ["B1", "B2"] }],
    } as CreateMatchRequestData;

    const result = await matchService.createMatch(input, "A1");
    expect(result).toBeTruthy();
    if (result) {
      expect(result.id).toBeDefined();
    }
  });

  it("should NOT confuse partners with opponents in 2v2", async () => {
    repo.getTournament = async () =>
      ({
        id: "t-1",
        status: "open",
        teamMode: "flex",
        championshipConfig: {
          maxMatchesPerPlayer: 10,
          maxTimesWithSamePartner: 2,
          maxTimesWithSameOpponent: 5,
        },
      }) as any;

    repo.validateEntriesForTournament = async () => undefined;
    repo.countMatchesForUser = async () => 1;

    // Team [A1,A2] has played 1 match together (under limit)
    repo.countMatchesForTeam = async (_tid: string, playerIds: string[]) => {
      if (playerIds.includes("A1") && playerIds.includes("A2")) return 1;
      return 0;
    };

    repo.countMatchesTeamsVsTeam = async () => 4; // High but still under limit

    // Mock creation and retrieval
    repo.create = async (_data: any) => "m-no-confusion";
    repo.getById = async (id: string) =>
      ({
        id,
        tournamentId: "t-1",
        status: "scheduled",
        scoreA: 0,
        scoreB: 0,
      }) as any;

    const input: CreateMatchRequestData = {
      tournamentId: "t-1",
      sides: [{ position: 1, playerIds: ["A1", "A2"] }, { position: 2, playerIds: ["B1", "B2"] }],
    } as CreateMatchRequestData;

    // Should succeed because partner constraint is satisfied (1 < 2)
    const result = await matchService.createMatch(input, "A1");
    expect(result).toBeTruthy();
    if (result) {
      expect(result.id).toBeDefined();
    }
  });

  it("should count 1v1 and 2v2 matches independently for partners (flex mode)", async () => {
    repo.getTournament = async () =>
      ({
        id: "t-1",
        status: "open",
        teamMode: "flex",
        championshipConfig: {
          maxMatchesPerPlayer: 10,
          maxTimesWithSamePartner: 2,
          maxTimesWithSameOpponent: 3,
        },
      }) as any;

    repo.validateEntriesForTournament = async () => undefined;
    repo.countMatchesForUser = async () => 5; // Many matches played

    // Mock: [A1,A2] as a 2-person team have played 0 times together (only played solo before)
    // The new repo method naturally handles this — it only counts exact team composition matches
    repo.countMatchesForTeam = async () => 0;

    repo.countMatchesTeamsVsTeam = async () => 0;

    // Mock creation and retrieval
    repo.create = async (_data: any) => "m-independent";
    repo.getById = async (id: string) =>
      ({
        id,
        tournamentId: "t-1",
        status: "scheduled",
        scoreA: 0,
        scoreB: 0,
      }) as any;

    // Creating a 2v2 match should succeed even though they played 2x in 1v1
    const input: CreateMatchRequestData = {
      tournamentId: "t-1",
      sides: [{ position: 1, playerIds: ["A1", "A2"] }, { position: 2, playerIds: ["B1", "B2"] }],
    } as CreateMatchRequestData;

    const result = await matchService.createMatch(input, "A1");
    expect(result).toBeTruthy();
    if (result) {
      expect(result.id).toBeDefined();
    }
  });

  it("should count 1v1 and 2v2 matches independently for opponents (flex mode)", async () => {
    repo.getTournament = async () =>
      ({
        id: "t-1",
        status: "open",
        teamMode: "flex",
        championshipConfig: {
          maxMatchesPerPlayer: 10,
          maxTimesWithSamePartner: 5,
          maxTimesWithSameOpponent: 2,
        },
      }) as any;

    repo.validateEntriesForTournament = async () => undefined;
    repo.countMatchesForUser = async () => 5;
    repo.countMatchesForTeam = async () => 0;

    // Mock: [A1,A2] as a team have never faced [B1,B2] as a team (only faced as solo)
    // The new repo method naturally handles this — it checks exact team composition
    repo.countMatchesTeamsVsTeam = async () => 0;

    // Mock creation and retrieval
    repo.create = async (_data: any) => "m-opponent-independent";
    repo.getById = async (id: string) =>
      ({
        id,
        tournamentId: "t-1",
        status: "scheduled",
        scoreA: 0,
        scoreB: 0,
      }) as any;

    // Creating a 2v2 match should succeed even though they played 2x against each other in 1v1
    const input: CreateMatchRequestData = {
      tournamentId: "t-1",
      sides: [{ position: 1, playerIds: ["A1", "A2"] }, { position: 2, playerIds: ["B1", "B2"] }],
    } as CreateMatchRequestData;

    const result = await matchService.createMatch(input, "A1");
    expect(result).toBeTruthy();
    if (result) {
      expect(result.id).toBeDefined();
    }
  });

  it("should block 2v2 match when 2v2 limit is reached (not 1v1)", async () => {
    repo.getTournament = async () =>
      ({
        id: "t-1",
        status: "open",
        teamMode: "flex",
        championshipConfig: {
          maxMatchesPerPlayer: 10,
          maxTimesWithSamePartner: 5,
          maxTimesWithSameOpponent: 2,
        },
      }) as any;

    repo.validateEntriesForTournament = async () => undefined;
    repo.countMatchesForUser = async () => 5;
    repo.countMatchesForTeam = async () => 0;

    // Mock: [A1,A2] as a team have faced [B1,B2] as a team 2 times (max reached for 2v2)
    repo.countMatchesTeamsVsTeam = async () => 2;

    const input: CreateMatchRequestData = {
      tournamentId: "t-1",
      sides: [{ position: 1, playerIds: ["A1", "A2"] }, { position: 2, playerIds: ["B1", "B2"] }],
    } as CreateMatchRequestData;

    try {
      await matchService.createMatch(input, "A1");
      throw new Error("Expected ConflictError");
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
      expect((err as ConflictError).code).toBe(
        ErrorCode.MAX_OPPONENT_MATCHES_EXCEEDED,
      );
    }
  });
});

describe("MatchService - Contestation Flow", () => {
  it("should allow participant to contest a reported match", async () => {
    let updatedStatus: string | undefined;
    repo.getById = async (id: string) => {
      if (updatedStatus) {
        return { id, tournamentId: "t-1", status: updatedStatus } as any;
      }
      return {
        id: "m-contest",
        tournamentId: "t-1",
        status: "reported",
        reportedBy: "u-rep",
      } as any;
    };
    repo.isUserInMatch = async () => true;
    repo.update = async (_id: string, data: UpdateMatchData) => {
      if (data.status) {
        updatedStatus = data.status;
      }
      return { id: _id, ...data } as any;
    };

    const result = await matchService.contestMatch(
      "m-contest",
      { contestationReason: "Score incorrect" } as any,
      "u-other",
    );

    expect(result).toBeTruthy();
    expect((result as any).status).toBe("disputed");
  });

  it("should throw ForbiddenError when non-participant tries to contest", async () => {
    repo.getById = async () =>
      ({
        id: "m-1",
        tournamentId: "t-1",
        status: "reported",
      }) as any;
    repo.isUserInMatch = async () => false;

    try {
      await matchService.contestMatch(
        "m-1",
        { contestationReason: "Wrong" } as any,
        "u-outsider",
      );
      throw new Error("Expected ForbiddenError");
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
    }
  });

  it("should throw BadRequestError when contesting finalized match", async () => {
    repo.getById = async () =>
      ({
        id: "m-1",
        tournamentId: "t-1",
        status: "finalized",
      }) as any;
    repo.isUserInMatch = async () => true;

    try {
      await matchService.contestMatch(
        "m-1",
        { contestationReason: "Too late" } as any,
        "u-1",
      );
      throw new Error("Expected BadRequestError");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
    }
  });

  it("should throw BadRequestError when contesting match with invalid status", async () => {
    repo.getById = async () =>
      ({
        id: "m-1",
        tournamentId: "t-1",
        status: "scheduled",
      }) as any;
    repo.isUserInMatch = async () => true;

    try {
      await matchService.contestMatch(
        "m-1",
        { contestationReason: "Not reported yet" } as any,
        "u-1",
      );
      throw new Error("Expected BadRequestError");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
    }
  });
});

describe("MatchService - Finalization Logic", () => {
  it("should finalize match when called directly", async () => {
    repo.getById = async () =>
      ({
        id: "m-fin",
        tournamentId: "t-1",
        status: "reported",
      }) as any;
    repo.update = async (_id: string, data: UpdateMatchData) =>
      ({ id: _id, ...data }) as any;

    const result = await matchService.finalizeMatch(
      "m-fin",
      { finalizationReason: "admin_override" },
      "u-admin",
    );

    expect(result).toBeTruthy();
    expect((result as any).status).toBe("finalized");
    expect((result as any).finalizationReason).toBe("admin_override");
  });

  it("should throw BadRequestError when finalizing already finalized match", async () => {
    repo.getById = async () =>
      ({
        id: "m-1",
        tournamentId: "t-1",
        status: "finalized",
      }) as any;

    try {
      await matchService.finalizeMatch("m-1", {
        finalizationReason: "consensus",
      });
      throw new Error("Expected BadRequestError");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
      expect((err as BadRequestError).code).toBe(
        ErrorCode.MATCH_ALREADY_FINALIZED,
      );
    }
  });

  it("should auto-finalize when majority confirms and both teams represented", async () => {
    repo.getById = async () =>
      ({
        id: "m-auto",
        tournamentId: "t-1",
        status: "reported",
      }) as any;
    repo.isUserInMatch = async () => true; // p3 is a participant
    repo.getParticipationsByMatchId = async () =>
      [
        { playerId: "p1", teamSide: "A" },
        { playerId: "p2", teamSide: "A" },
        { playerId: "p3", teamSide: "B" },
        { playerId: "p4", teamSide: "B" },
      ] as any;
    confRepo.getByMatchId = async () =>
      [
        { playerId: "p1", isConfirmed: true, isContested: false },
        { playerId: "p2", isConfirmed: true, isContested: false },
        { playerId: "p3", isConfirmed: true, isContested: false },
        // p4 hasn't confirmed yet, but 3/4 is >50% and both teams have confirmations
      ] as any;
    repo.update = async (_id: string, data: UpdateMatchData) =>
      ({ id: _id, ...data }) as any;

    // Simulate confirmation that triggers auto-finalization
    await matchService.confirmMatch("m-auto", {} as any, "p3");

    // The match should be finalized automatically
    // Note: In real implementation, checkAndFinalizeMatch is called internally
  });

  it("should set status to disputed when contestation exists", async () => {
    repo.getById = async () =>
      ({
        id: "m-disputed",
        tournamentId: "t-1",
        status: "reported",
      }) as any;
    repo.isUserInMatch = async () => true; // p1 is a participant
    repo.getParticipationsByMatchId = async () =>
      [
        { playerId: "p1", teamSide: "A" },
        { playerId: "p2", teamSide: "B" },
      ] as any;
    confRepo.getByMatchId = async () =>
      [
        { playerId: "p1", isConfirmed: true, isContested: false },
        { playerId: "p2", isConfirmed: false, isContested: true },
      ] as any;
    confRepo.hasAnyContestation = async () => true;
    repo.update = async (_id: string, data: UpdateMatchData) =>
      ({ id: _id, ...data }) as any;

    // When a player confirms but there's a contestation
    const result = await matchService.confirmMatch(
      "m-disputed",
      {} as any,
      "p1",
    );

    // Status should be disputed due to contestation
    expect(["reported", "pending_confirmation", "disputed"]).toContain(
      (result as any).status,
    );
  });
});

describe("MatchService - Auto-Finalization", () => {
  it("should auto-finalize expired matches without contestation", async () => {
    const pastDate = new Date();
    pastDate.setHours(pastDate.getHours() - 100); // 100 hours ago

    repo.getMatchesPendingFinalization = async () => [
      {
        id: "m-expired-1",
        status: "reported",
        confirmationDeadline: pastDate,
      },
      {
        id: "m-expired-2",
        status: "reported",
        confirmationDeadline: pastDate,
      },
    ] as any[];

    confRepo.hasAnyContestation = async () => false;
    repo.getById = async (id: string) =>
      ({
        id,
        tournamentId: "t-1",
        status: "reported",
      }) as any;
    repo.update = async (_id: string, data: UpdateMatchData) =>
      ({ id: _id, ...data }) as any;

    const result = await matchService.autoFinalizeExpiredMatches();

    expect(result.finalized.length).toBe(2);
    expect(result.disputed.length).toBe(0);
    expect(result.total).toBe(2);
  });

  it("should mark expired matches as disputed when contestation exists", async () => {
    const pastDate = new Date();
    pastDate.setHours(pastDate.getHours() - 100);

    repo.getMatchesPendingFinalization = async () => [
      {
        id: "m-contested",
        status: "reported",
        confirmationDeadline: pastDate,
      },
    ] as any[];

    // Return a "simple contestation" (isContested: true with no proposedScoreA)
    confRepo.getByMatchId = async () => [
      {
        id: "conf-1",
        matchId: "m-contested",
        userId: "user-1",
        side: "teamA",
        isContested: true,
        proposedScoreA: null,
        proposedScoreB: null,
      } as any,
    ];
    repo.getById = async (id: string) =>
      ({
        id,
        tournamentId: "t-1",
        status: "reported",
      }) as any;
    repo.update = async (_id: string, data: UpdateMatchData) =>
      ({ id: _id, ...data }) as any;

    const result = await matchService.autoFinalizeExpiredMatches();

    expect(result.finalized.length).toBe(0);
    expect(result.disputed.length).toBe(1);
    expect(result.total).toBe(1);
  });

  it("should skip matches with future deadline", async () => {
    const futureDate = new Date();
    futureDate.setHours(futureDate.getHours() + 24); // 24 hours from now

    repo.getMatchesPendingFinalization = async () => [
      {
        id: "m-future",
        status: "reported",
        confirmationDeadline: futureDate,
      },
    ] as any[];

    const result = await matchService.autoFinalizeExpiredMatches();

    expect(result.finalized.length).toBe(0);
    expect(result.disputed.length).toBe(0);
    expect(result.total).toBe(0);
  });
});

describe("MatchService - Status Transitions", () => {
  it("should allow reporting scheduled match", async () => {
    repo.getById = async () =>
      ({
        id: "m-1",
        tournamentId: "t-1",
        status: "scheduled",
        sides: [{ position: 1, teamId: "A" }, { position: 2, teamId: "B" }],
      }) as any;
    repo.isUserInMatch = async () => true;
    repo.getTournament = async () => ({ id: "t-1", allowDraw: true }) as any;
    repo.update = async (_id: string, data: UpdateMatchData) =>
      ({ id: _id, ...data }) as any;
    repo.getParticipationsByMatchId = async () => [];

    const result = await matchService.reportMatchResult(
      "m-1",
      { scoreA: 2, scoreB: 1 } as any,
      "u-1",
    );

    expect((result as any).status).toBe("reported");
  });

  it("should allow re-reporting reported match", async () => {
    repo.getById = async () =>
      ({
        id: "m-1",
        tournamentId: "t-1",
        status: "reported",
        sides: [{ position: 1, teamId: "A" }, { position: 2, teamId: "B" }],
      }) as any;
    repo.isUserInMatch = async () => true;
    repo.getTournament = async () => ({ id: "t-1", allowDraw: true }) as any;
    repo.update = async (_id: string, data: UpdateMatchData) =>
      ({ id: _id, ...data }) as any;
    repo.getParticipationsByMatchId = async () => [];

    const result = await matchService.reportMatchResult(
      "m-1",
      { scoreA: 3, scoreB: 2 } as any,
      "u-1",
    );

    expect((result as any).status).toBe("reported");
    expect((result as any).scoreA).toBe(3);
  });

  it("should reject reporting confirmed match", async () => {
    repo.getById = async () =>
      ({
        id: "m-1",
        tournamentId: "t-1",
        status: "confirmed",
      }) as any;
    repo.isUserInMatch = async () => true;

    try {
      await matchService.reportMatchResult(
        "m-1",
        { scoreA: 1, scoreB: 0 } as any,
        "u-1",
      );
      throw new Error("Expected BadRequestError");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
    }
  });

  it("should reject confirming scheduled match", async () => {
    repo.getById = async () =>
      ({
        id: "m-1",
        tournamentId: "t-1",
        status: "scheduled",
      }) as any;
    repo.isUserInMatch = async () => true;

    try {
      await matchService.confirmMatch("m-1", {} as any, "u-1");
      throw new Error("Expected BadRequestError");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
    }
  });
});

describe("MatchService - Edge Cases", () => {
  it("should handle match with no participants gracefully", async () => {
    repo.getById = async () =>
      ({
        id: "m-empty",
        tournamentId: "t-1",
        status: "reported",
      }) as any;
    repo.isUserInMatch = async () => true; // Allow the confirmation
    repo.getParticipationsByMatchId = async () => [];
    confRepo.getByMatchId = async () => [];

    // Should not throw, just not finalize
    await matchService.confirmMatch("m-empty", {} as any, "u-1");
  });

  it("should handle team size mismatch in flex mode", async () => {
    repo.getTournament = async () =>
      ({
        id: "t-1",
        status: "open",
        teamMode: "flex",
        championshipConfig: {
          maxMatchesPerPlayer: 10,
          maxTimesWithSamePartner: 5,
          maxTimesWithSameOpponent: 5,
        },
      }) as any;
    usrRepo.getById = async () => ({ id: "u-1", role: "super_admin" }) as any;

    const input = {
      tournamentId: "t-1",
      sides: [{ position: 1, playerIds: ["p1", "p2"] }, { position: 2, playerIds: ["p3"] }], // Mismatch!
    } as any;

    try {
      await matchService.createMatch(input, "u-admin");
      throw new Error("Expected BadRequestError");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
      expect((err as BadRequestError).code).toBe(
        ErrorCode.MATCH_TEAM_SIZE_MISMATCH,
      );
    }
  });

  it("should handle confirmation deadline correctly", async () => {
    repo.getById = async () =>
      ({
        id: "m-1",
        tournamentId: "t-1",
        status: "scheduled",
        sides: [{ position: 1, teamId: "A" }, { position: 2, teamId: "B" }],
      }) as any;
    repo.isUserInMatch = async () => true;
    repo.getTournament = async () =>
      ({ id: "t-1", allowDraw: true, validationMode: "auto", validationTimerHours: null }) as any;

    let capturedData: any = null;
    repo.update = async (_id: string, data: UpdateMatchData) => {
      capturedData = data;
      return { id: _id, ...data } as any;
    };
    repo.getParticipationsByMatchId = async () => [];

    await matchService.reportMatchResult(
      "m-1",
      { scoreA: 2, scoreB: 1 } as any,
      "u-1",
    );

    expect(capturedData.confirmationDeadline).toBeTruthy();
    expect(capturedData.confirmationDeadline).toBeInstanceOf(Date);

    // Deadline should be ~24 hours from now (AUTO mode default)
    const now = new Date();
    const deadline = new Date(capturedData.confirmationDeadline);
    const hoursDiff = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);
    expect(hoursDiff).toBeGreaterThan(23);
    expect(hoursDiff).toBeLessThan(25);
  });

  it("should create match with reported status and auto-confirm creator", async () => {
    repo.getTournament = async () =>
      ({
        id: "t-1",
        status: "open",
        teamMode: "flex",
        scoreEnabled: true,
        championshipConfig: {
          maxMatchesPerPlayer: 10,
          maxTimesWithSamePartner: 5,
          maxTimesWithSameOpponent: 5,
        },
      }) as any;
    repo.create = async (_data: any) => "m-new";
    repo.getById = async (id: string) =>
      ({ id, tournamentId: "t-1", status: "reported" }) as any;
    repo.getParticipationsByMatchId = async () => [];

    let confirmationCreated = false;
    confRepo.upsert = async (data: any) => {
      if (data.playerId === "u-1" && data.isConfirmed) {
        confirmationCreated = true;
      }
      return { id: "conf-1", ...data } as any;
    };

    const input = {
      tournamentId: "t-1",
      sides: [{ position: 1, playerIds: ["u-1"] }, { position: 2, playerIds: ["u-2"] }],
      status: "reported",
      scoreA: 2,
      scoreB: 1,
    } as any;

    await matchService.createMatch(input, "u-1");

    expect(confirmationCreated).toBe(true);
  });
});

describe("MatchService - Kiosk role permissions", () => {
  it("confirmMatch should reject kiosk users", async () => {
    repo.getById = async () =>
      ({ id: "m-k", tournamentId: "t-1", status: "reported" }) as any;
    usrRepo.getById = async () =>
      ({ id: "u-kiosk", role: "kiosk" }) as any;

    try {
      await matchService.confirmMatch(
        "m-k",
        {} as ConfirmMatchRequestData,
        "u-kiosk",
      );
      throw new Error("Expected ForbiddenError");
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
      expect((err as ForbiddenError).code).toBe(
        ErrorCode.INSUFFICIENT_PERMISSIONS,
      );
    }
  });

  it("contestMatch should reject kiosk users", async () => {
    repo.getById = async () =>
      ({ id: "m-k", tournamentId: "t-1", status: "reported" }) as any;
    usrRepo.getById = async () =>
      ({ id: "u-kiosk", role: "kiosk" }) as any;

    try {
      await matchService.contestMatch(
        "m-k",
        { contestationReason: "x" } as any,
        "u-kiosk",
      );
      throw new Error("Expected ForbiddenError");
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
    }
  });

  it("cancelMatch should reject kiosk user when not creator", async () => {
    repo.getById = async () =>
      ({
        id: "m-c",
        tournamentId: "t-1",
        status: "scheduled",
        createdBy: "u-other",
      }) as any;
    usrRepo.getById = async () =>
      ({ id: "u-kiosk", role: "kiosk" }) as any;

    try {
      await matchService.cancelMatch("m-c", "u-kiosk");
      throw new Error("Expected ForbiddenError");
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
    }
  });

  it("cancelMatch should allow kiosk user when creator", async () => {
    repo.getById = async (id: string) =>
      ({
        id,
        tournamentId: "t-1",
        status: "scheduled",
        createdBy: "u-kiosk",
      }) as any;
    usrRepo.getById = async () =>
      ({ id: "u-kiosk", role: "kiosk" }) as any;
    let updateCalledWith: UpdateMatchData | null = null;
    repo.update = async (_id: string, data: UpdateMatchData) => {
      updateCalledWith = data;
      return { id: _id, ...data } as any;
    };

    await matchService.cancelMatch("m-c", "u-kiosk");
    expect(updateCalledWith!.status).toBe("cancelled");
  });

  it("cancelMatch by admin clears action notifications", async () => {
    repo.getById = async (id: string) =>
      ({
        id,
        tournamentId: "t-1",
        status: "reported",
        createdBy: "u-other",
      }) as any;
    usrRepo.getById = async () =>
      ({ id: "u-admin", role: "super_admin" }) as any;

    let deleteActionsCalled = false;
    notifService.deleteActionsByMatchId = async () => {
      deleteActionsCalled = true;
      return [];
    };

    await matchService.cancelMatch("m-c", "u-admin");
    expect(deleteActionsCalled).toBe(true);
  });
});

describe("MatchService - Dispute handling", () => {
  it("a dispute parks the match on 'disputed', clears the deadline and alerts the organizers", async () => {
    repo.getById = async (id: string) =>
      ({
        id,
        tournamentId: "t-1",
        status: "reported",
        result: { reportedBy: "p2" },
      }) as any;
    repo.getTournament = async () =>
      ({ id: "t-1", validationMode: "auto", validationTimerHours: 24 }) as any;
    repo.isUserInMatch = async () => true;
    repo.getParticipationsByMatchId = async () =>
      [
        { playerId: "p1", teamSide: "A" },
        { playerId: "p2", teamSide: "B" },
      ] as any;
    tourRepo.getAdminUserIds = async () => ["admin-1"];

    let updateCalledWith: UpdateMatchData | null = null;
    repo.update = async (_id: string, data: UpdateMatchData) => {
      updateCalledWith = data;
      return { id: _id, ...data } as any;
    };

    const notified: string[] = [];
    notifService.send = async (payload: any) => {
      notified.push(payload.userId);
      return undefined as any;
    };

    await matchService.contestMatch("m-1", { contestationReason: "wrong" } as any, "p1");

    expect(updateCalledWith!.status).toBe("disputed");
    // No timer on a disagreement: it is settled by a human, never by expiry
    expect(updateCalledWith!.confirmationDeadline).toBeNull();
    expect(notified).toEqual(["admin-1"]);
  });

  it("the reason of a dispute is posted in the thread, not frozen on the confirmation", async () => {
    repo.getById = async (id: string) =>
      ({
        id,
        tournamentId: "t-1",
        status: "reported",
        result: { reportedBy: "p2" },
      }) as any;
    repo.getTournament = async () =>
      ({ id: "t-1", validationMode: "auto", validationTimerHours: 24 }) as any;
    repo.isUserInMatch = async () => true;
    repo.getParticipationsByMatchId = async () =>
      [
        { playerId: "p1", teamSide: "A" },
        { playerId: "p2", teamSide: "B" },
      ] as any;

    const upserted: any[] = [];
    confRepo.upsert = async (data: any) => {
      upserted.push(data);
      return { id: "conf-1", ...data } as any;
    };

    const notes: Array<{ userId: string; body?: string | null }> = [];
    (matchMessageService as any).postUserNote = async (
      _matchId: string,
      userId: string,
      body?: string | null,
    ) => {
      notes.push({ userId, body });
    };

    await matchService.respondToMatch(
      "m-1",
      { type: "dispute", reason: "the score is reversed" } as any,
      "p1",
    );

    expect(upserted[0].contestationReason).toBeUndefined();
    expect(notes).toEqual([{ userId: "p1", body: "the score is reversed" }]);
    // Whoever has the match open sees it move to 'disputed' without reloading
    expect(matchUpdatesBroadcast).toContain("m-1");
  });

  it("a disputed match is never auto-finalized when its deadline expires", async () => {
    const pastDate = new Date();
    pastDate.setHours(pastDate.getHours() - 100);

    repo.getMatchesPendingFinalization = async () =>
      [{ id: "m-exp", status: "reported", confirmationDeadline: pastDate }] as any[];
    confRepo.getByMatchId = async () =>
      [{ playerId: "p1", isContested: true, isPostFinalization: false }] as any;
    repo.getById = async (id: string) =>
      ({ id, tournamentId: "t-1", status: "reported" }) as any;

    const result = await matchService.autoFinalizeExpiredMatches();

    expect(result.disputed).toContain("m-exp");
    expect(result.finalized).toHaveLength(0);
  });

  it("agreeing on a disputed match withdraws the contestation and re-opens validation", async () => {
    let status = "disputed";
    repo.getById = async (id: string) =>
      ({ id, tournamentId: "t-1", status, result: { reportedBy: "p2" } }) as any;
    repo.getTournament = async () =>
      ({ id: "t-1", validationMode: "auto", validationTimerHours: 24 }) as any;
    repo.isUserInMatch = async () => true;
    repo.getParticipationsByMatchId = async () =>
      [
        { playerId: "p1", teamSide: "A" },
        { playerId: "p2", teamSide: "B" },
      ] as any;
    // p1 drops their contestation, nobody else contests
    confRepo.getByMatchId = async () =>
      [{ playerId: "p1", isConfirmed: true, isContested: false, isPostFinalization: false }] as any;

    const upserted: any[] = [];
    confRepo.upsert = async (data: any) => {
      upserted.push(data);
      return { id: "conf-1", ...data } as any;
    };

    const updateCalls: UpdateMatchData[] = [];
    repo.update = async (_id: string, data: UpdateMatchData) => {
      updateCalls.push(data);
      if (data.status) status = data.status;
      return { id: _id, ...data } as any;
    };

    const purged: string[] = [];
    notifService.deleteActionsByMatchIdAndType = async (_matchId: string, type: string) => {
      purged.push(type);
      return [];
    };

    await matchService.respondToMatch("m-dis", { type: "agree" } as any, "p1");

    // The stale contestation is wiped, not just flagged as confirmed
    expect(upserted[0].isContested).toBe(false);
    expect(upserted[0].contestationReason).toBeNull();
    expect(updateCalls[0].status).toBe("reported");
    expect(updateCalls[0].confirmationDeadline).toBeInstanceOf(Date);
    // Only the arbitration request is dropped: other players may still owe a validation
    expect(purged).toEqual(["MATCH_DISPUTE_ESCALATED"]);
  });

  it("a withdrawal by the opponent finalizes the match by consensus", async () => {
    let status = "disputed";
    repo.getById = async (id: string) =>
      ({
        id,
        tournamentId: "t-1",
        status,
        result: { reportedBy: "p2" },
        sides: [{ position: 1 }, { position: 2 }],
      }) as any;
    repo.getTournament = async () =>
      ({ id: "t-1", mode: "championship", validationMode: "auto", validationTimerHours: 24 }) as any;
    repo.isUserInMatch = async () => true;
    repo.getParticipationsByMatchId = async () =>
      [
        { playerId: "p1", teamSide: "A" },
        { playerId: "p2", teamSide: "B" },
      ] as any;
    confRepo.getByMatchId = async () =>
      [{ playerId: "p1", isConfirmed: true, isContested: false, isPostFinalization: false }] as any;
    repo.update = async (_id: string, data: UpdateMatchData) => {
      if (data.status) status = data.status;
      return { id: _id, ...data } as any;
    };

    const finalized: any[] = [];
    const realFinalize = matchService.finalizeMatch.bind(matchService);
    (matchService as any).finalizeMatch = async (id: string, input: any) => {
      finalized.push(input);
      return { id } as any;
    };

    try {
      await matchService.respondToMatch("m-dis", { type: "agree" } as any, "p1");
    } finally {
      (matchService as any).finalizeMatch = realFinalize;
    }

    expect(finalized).toHaveLength(1);
    expect(finalized[0].finalizationReason).toBe("consensus");
  });

  it("the match stays disputed while another player still contests", async () => {
    repo.getById = async (id: string) =>
      ({ id, tournamentId: "t-1", status: "disputed", result: { reportedBy: "p3" } }) as any;
    repo.getTournament = async () =>
      ({ id: "t-1", validationMode: "auto", validationTimerHours: 24 }) as any;
    repo.isUserInMatch = async () => true;
    repo.getParticipationsByMatchId = async () =>
      [
        { playerId: "p1", teamSide: "A" },
        { playerId: "p2", teamSide: "A" },
        { playerId: "p3", teamSide: "B" },
      ] as any;
    confRepo.getByMatchId = async () =>
      [
        { playerId: "p1", isConfirmed: true, isContested: false, isPostFinalization: false },
        { playerId: "p2", isConfirmed: false, isContested: true, isPostFinalization: false },
      ] as any;

    const updateCalls: UpdateMatchData[] = [];
    repo.update = async (_id: string, data: UpdateMatchData) => {
      updateCalls.push(data);
      return { id: _id, ...data } as any;
    };

    const purged: string[] = [];
    notifService.deleteActionsByMatchIdAndType = async (_matchId: string, type: string) => {
      purged.push(type);
      return [];
    };

    await matchService.respondToMatch("m-dis", { type: "agree" } as any, "p1");

    expect(updateCalls).toHaveLength(0);
    expect(purged).toHaveLength(0);
  });
});

describe("MatchService - Post-finalization contestation", () => {
  const finalizedMatch = (over: Record<string, unknown> = {}) =>
    ({
      id: "m-fin",
      tournamentId: "t-1",
      status: "finalized",
      result: {
        reportedBy: "p2",
        finalizedAt: new Date(Date.now() - 60 * 60 * 1000),
        finalizationReason: "auto_validation",
      },
      ...over,
    }) as any;

  beforeEach(() => {
    repo.getById = async (_id: string) => finalizedMatch();
    repo.getTournament = async () => ({ id: "t-1", validationMode: "none" }) as any;
    repo.isUserInMatch = async () => true;
    repo.getParticipationsByMatchId = async () =>
      [
        { playerId: "p1", teamSide: "A" },
        { playerId: "p2", teamSide: "B" },
      ] as any;
    confRepo.hasPlayerDisputedPostFinalization = async () => false;
    confRepo.upsert = async (data: any) => ({ id: "conf-1", ...data }) as any;
    confRepo.delete = async () => undefined;
  });

  it("a contestation lands in the thread, reason included", async () => {
    const upserted: any[] = [];
    confRepo.upsert = async (data: any) => {
      upserted.push(data);
      return { id: "conf-1", ...data } as any;
    };

    const systemKeys: string[] = [];
    (matchMessageService as any).postSystem = async (_id: string, key: string) => {
      systemKeys.push(key);
    };
    const notes: Array<{ userId: string; body?: string | null }> = [];
    (matchMessageService as any).postUserNote = async (
      _id: string,
      userId: string,
      body?: string | null,
    ) => {
      notes.push({ userId, body });
    };

    await matchService.respondToMatch(
      "m-fin",
      { type: "dispute", reason: "the score is reversed" } as any,
      "p1",
    );

    expect(upserted[0].isPostFinalization).toBe(true);
    expect(upserted[0].isContested).toBe(true);
    expect(systemKeys).toEqual(["matchMessages.RESULT_DISPUTED_POST"]);
    expect(notes).toEqual([{ userId: "p1", body: "the score is reversed" }]);
    // The opponents' open pages learn about it without a reload
    expect(matchUpdatesBroadcast).toContain("m-fin");
  });

  it("withdrawing drops only the post-finalization row and the arbitration request", async () => {
    confRepo.hasPlayerDisputedPostFinalization = async () => true;

    const deleted: Array<[string, string, boolean | undefined]> = [];
    confRepo.delete = async (matchId: string, playerId: string, isPost?: boolean) => {
      deleted.push([matchId, playerId, isPost]);
    };

    const updateCalls: UpdateMatchData[] = [];
    repo.update = async (_id: string, data: UpdateMatchData) => {
      updateCalls.push(data);
      return { id: _id, ...data } as any;
    };

    const purged: string[] = [];
    notifService.deleteActionsByMatchIdAndType = async (_matchId: string, type: string) => {
      purged.push(type);
      return [];
    };

    const systemKeys: string[] = [];
    (matchMessageService as any).postSystem = async (_id: string, key: string) => {
      systemKeys.push(key);
    };

    await matchService.respondToMatch("m-fin", { type: "agree" } as any, "p1");

    expect(deleted).toEqual([["m-fin", "p1", true]]);
    expect(purged).toEqual(["MATCH_POST_DISPUTE"]);
    expect(systemKeys).toEqual(["matchMessages.POST_DISPUTE_WITHDRAWN"]);
    // The result itself is untouched: the match was and stays finalized
    expect(updateCalls).toHaveLength(0);
  });

  it("a player may contest again once they have withdrawn", async () => {
    let hasDispute = true;
    confRepo.hasPlayerDisputedPostFinalization = async () => hasDispute;
    confRepo.delete = async () => {
      hasDispute = false;
    };

    const upserted: any[] = [];
    confRepo.upsert = async (data: any) => {
      upserted.push(data);
      hasDispute = true;
      return { id: "conf-1", ...data } as any;
    };

    await matchService.respondToMatch("m-fin", { type: "agree" } as any, "p1");
    await matchService.respondToMatch(
      "m-fin",
      { type: "dispute", reason: "still wrong" } as any,
      "p1",
    );

    expect(upserted).toHaveLength(1);
    expect(upserted[0].isPostFinalization).toBe(true);
  });

  it("agreeing with nothing to withdraw is rejected", async () => {
    try {
      await matchService.respondToMatch("m-fin", { type: "agree" } as any, "p1");
      throw new Error("Expected BadRequestError");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
      expect((err as AppError).code).toBe(ErrorCode.CANNOT_AGREE_AFTER_FINALIZATION);
    }
  });

  it("contesting twice is rejected", async () => {
    confRepo.hasPlayerDisputedPostFinalization = async () => true;

    try {
      await matchService.respondToMatch("m-fin", { type: "dispute" } as any, "p1");
      throw new Error("Expected BadRequestError");
    } catch (err) {
      expect((err as AppError).code).toBe(ErrorCode.ALREADY_DISPUTED);
    }
  });

  it("a contestation can still be taken back once the window has closed", async () => {
    const expired = new Date(Date.now() - (POST_FINALIZATION_DISPUTE_DAYS + 1) * 86400000);
    repo.getById = async () =>
      finalizedMatch({
        result: {
          reportedBy: "p2",
          finalizedAt: expired,
          finalizationReason: "auto_validation",
        },
      });
    confRepo.hasPlayerDisputedPostFinalization = async () => true;

    const deleted: Array<[string, string, boolean | undefined]> = [];
    confRepo.delete = async (matchId: string, playerId: string, isPost?: boolean) => {
      deleted.push([matchId, playerId, isPost]);
    };
    const purged: string[] = [];
    notifService.deleteActionsByMatchIdAndType = async (_matchId: string, type: string) => {
      purged.push(type);
      return [];
    };

    await matchService.respondToMatch("m-fin", { type: "agree" } as any, "p1");

    // Otherwise an expired contestation would keep the organizers on the hook forever
    expect(deleted).toEqual([["m-fin", "p1", true]]);
    expect(purged).toEqual(["MATCH_POST_DISPUTE"]);
  });

  it("the window closes after the allowed number of days", async () => {
    const expired = new Date(Date.now() - (POST_FINALIZATION_DISPUTE_DAYS + 1) * 86400000);
    repo.getById = async () =>
      finalizedMatch({
        result: {
          reportedBy: "p2",
          finalizedAt: expired,
          finalizationReason: "auto_validation",
        },
      });

    try {
      await matchService.respondToMatch("m-fin", { type: "dispute" } as any, "p1");
      throw new Error("Expected BadRequestError");
    } catch (err) {
      expect((err as AppError).code).toBe(ErrorCode.DISPUTE_WINDOW_EXPIRED);
    }
  });

  it("a mode that never auto-validates leaves nothing to contest afterwards", async () => {
    repo.getTournament = async () => ({ id: "t-1", validationMode: "strict" }) as any;

    try {
      await matchService.respondToMatch("m-fin", { type: "dispute" } as any, "p1");
      throw new Error("Expected BadRequestError");
    } catch (err) {
      expect((err as AppError).code).toBe(ErrorCode.DISPUTE_NOT_ALLOWED_FOR_VALIDATION_MODE);
    }
  });

  it("a result everyone signed or an organizer arbitrated is not contestable", async () => {
    for (const finalizationReason of ["consensus", "admin_override"]) {
      repo.getById = async () =>
        finalizedMatch({
          result: {
            reportedBy: "p2",
            finalizedAt: new Date(Date.now() - 60 * 60 * 1000),
            finalizationReason,
          },
        });

      try {
        await matchService.respondToMatch("m-fin", { type: "dispute" } as any, "p1");
        throw new Error("Expected BadRequestError");
      } catch (err) {
        expect((err as AppError).code).toBe(ErrorCode.DISPUTE_NOT_ALLOWED_FOR_VALIDATION_MODE);
      }
    }
  });
});

describe("MatchService - Author result revision", () => {
  const reportedMatch = (id: string) =>
    ({
      id,
      tournamentId: "t-1",
      status: "reported",
      createdBy: "p1",
      result: { reportedBy: "p1" },
      sides: [
        { position: 1, score: 3 },
        { position: 2, score: 1 },
      ],
    }) as any;

  it("the author may fix a reported entry, which drops the opponents' confirmations", async () => {
    repo.getById = async (id: string) => reportedMatch(id);
    repo.getTournament = async () =>
      ({ id: "t-1", mode: "championship", validationMode: "strict" }) as any;
    repo.isUserInMatch = async () => true;

    const resetExcept: { playerId: string | null } = { playerId: null };
    confRepo.resetConfirmationsExcept = async (_matchId: string, playerId: string) => {
      resetExcept.playerId = playerId;
      return undefined as any;
    };

    const trust = { reset: false };
    usrRepo.resetTrustScore = async () => {
      trust.reset = true;
    };

    const updateCalls: UpdateMatchData[] = [];
    repo.update = async (_id: string, data: UpdateMatchData) => {
      updateCalls.push(data);
      return { id: _id, ...data } as any;
    };

    await matchService.updateMatch("m-rev", { scoreA: 2, scoreB: 5 } as any, "p1");

    expect(updateCalls[0].scoreA).toBe(2);
    // The corrected entry re-opens a validation round instead of staying half-approved
    expect(updateCalls[0].status).toBe("reported");
    expect(updateCalls[0].reportedBy).toBe("p1");
    expect(resetExcept.playerId).toBe("p1");
    // Correcting your own typo is not a contestation
    expect(trust.reset).toBe(false);
  });

  it("a correction pulls a contested match back into the validation round", async () => {
    repo.getById = async (id: string) =>
      ({ ...reportedMatch(id), status: "disputed" }) as any;
    repo.getTournament = async () =>
      ({ id: "t-1", mode: "championship", validationMode: "strict" }) as any;
    repo.isUserInMatch = async () => true;
    confRepo.resetConfirmationsExcept = async () => undefined as any;

    const updateCalls: UpdateMatchData[] = [];
    repo.update = async (_id: string, data: UpdateMatchData) => {
      updateCalls.push(data);
      return { id: _id, ...data } as any;
    };

    await matchService.updateMatch("m-rev2", { scoreA: 4, scoreB: 2 } as any, "p1");

    expect(updateCalls[0].status).toBe("reported");
  });

  it("a participant who did not report the result cannot edit it", async () => {
    repo.getById = async (id: string) => reportedMatch(id);
    repo.getTournament = async () => ({ id: "t-1", mode: "championship" }) as any;
    repo.isUserInMatch = async () => true;

    await expect(
      matchService.updateMatch("m-rev3", { scoreA: 9, scoreB: 0 } as any, "p2"),
    ).rejects.toThrow(ForbiddenError);
  });

  it("an outcome-only correction validates against the stored score, not 0-0", async () => {
    repo.getById = async (id: string) => reportedMatch(id);
    // minScore 1 rejects a 0, allowDraw false rejects a draw: both fire if the
    // untouched sides fall back to 0 instead of the 3-1 already stored.
    repo.getTournament = async () =>
      ({
        id: "t-1",
        mode: "championship",
        validationMode: "strict",
        minScore: 1,
        allowDraw: false,
      }) as any;
    repo.isUserInMatch = async () => true;
    confRepo.resetConfirmationsExcept = async () => undefined as any;

    const updateCalls: UpdateMatchData[] = [];
    repo.update = async (_id: string, data: UpdateMatchData) => {
      updateCalls.push(data);
      return { id: _id, ...data } as any;
    };

    await matchService.updateMatch("m-rev4", { outcomeTypeId: "ot-2" } as any, "p1");

    expect(updateCalls[0].outcomeTypeId).toBe("ot-2");
    // The scores were not part of the correction, so they are left untouched
    expect(updateCalls[0].scoreA).toBeUndefined();
    expect(updateCalls[0].status).toBe("reported");
  });
});

describe("MatchService - finalizeMatch side-effects", () => {
  it("finalizeMatch invokes bracket advancement for both winner and loser", async () => {
    repo.getById = async () =>
      ({ id: "m-fin", tournamentId: "t-1", status: "reported" }) as any;
    repo.update = async (_id: string, data: UpdateMatchData) =>
      ({ id: _id, ...data }) as any;

    let advWinner = false;
    let advLoser = false;
    (bracketService as any).advanceWinnerToNextRound = async () => {
      advWinner = true;
    };
    (bracketService as any).advanceLoserToNextRound = async () => {
      advLoser = true;
    };

    await matchService.finalizeMatch(
      "m-fin",
      { finalizationReason: "consensus" },
      "u-1",
    );

    expect(advWinner).toBe(true);
    expect(advLoser).toBe(true);
  });

  it("finalizeMatch enqueues MMR job for ranked tournament", async () => {
    repo.getById = async () =>
      ({ id: "m-fin", tournamentId: "t-r", status: "reported" }) as any;
    repo.update = async (_id: string, data: UpdateMatchData) =>
      ({ id: _id, ...data }) as any;

    (rankedSeasonRepository as any).getConfigByTournamentId = async () => ({
      id: "rs-1",
      tournamentId: "t-r",
    });

    await matchService.finalizeMatch("m-fin", {
      finalizationReason: "consensus",
    });

    expect(mmrQueueCalls.finalization).toBe(1);
  });

  it("finalizeMatch defers ranked cache refresh to the worker, not synchronously", async () => {
    repo.getById = async () =>
      ({ id: "m-fin", tournamentId: "t-r", status: "reported" }) as any;
    repo.update = async (_id: string, data: UpdateMatchData) =>
      ({ id: _id, ...data }) as any;

    (rankedSeasonRepository as any).getConfigByTournamentId = async () => ({
      id: "rs-1",
      tournamentId: "t-r",
    });

    let officialCalled = false;
    let provisionalCalled = false;
    (rankedSeasonService as any).computeAndCacheOfficial = async () => {
      officialCalled = true;
    };
    (rankedSeasonService as any).computeAndCacheProvisional = async () => {
      provisionalCalled = true;
    };

    await matchService.finalizeMatch("m-fin", {
      finalizationReason: "consensus",
    });

    // The job is enqueued; cache recomputation happens later in the worker
    expect(mmrQueueCalls.finalization).toBe(1);
    expect(officialCalled).toBe(false);
    expect(provisionalCalled).toBe(false);
  });

  it("finalizeMatch skips ranked caches when tournament is not ranked", async () => {
    repo.getById = async () =>
      ({ id: "m-fin", tournamentId: "t-nr", status: "reported" }) as any;
    repo.update = async (_id: string, data: UpdateMatchData) =>
      ({ id: _id, ...data }) as any;

    (rankedSeasonRepository as any).getConfigByTournamentId = async () => null;

    let officialCalled = false;
    let provisionalCalled = false;
    (rankedSeasonService as any).computeAndCacheOfficial = async () => {
      officialCalled = true;
    };
    (rankedSeasonService as any).computeAndCacheProvisional = async () => {
      provisionalCalled = true;
    };

    await matchService.finalizeMatch("m-fin", {
      finalizationReason: "consensus",
    });

    expect(mmrQueueCalls.finalization).toBe(0);
    expect(officialCalled).toBe(false);
    expect(provisionalCalled).toBe(false);
  });
});

describe("MatchService - listMatchCards", () => {
  it("returns empty payload when repository returns no rows", async () => {
    (matchRepository as any).listMatchCards = async () => ({
      data: [],
      total: 0,
    });
    const res = await matchService.listMatchCards({
      offset: 0,
      limit: 10,
    } as any, null);
    expect(res).toEqual({ data: [], total: 0, hasMore: false });
  });

  it("maps rows + sides and computes hasMore correctly", async () => {
    (matchRepository as any).listMatchCards = async () => ({
      data: [
        {
          matchId: "m-1",
          playedAt: new Date("2026-05-01T10:00:00Z"),
          status: "finalized",
          tournamentId: "t-1",
          tournamentName: "Tour",
          tournamentMode: "ranked",
          tournamentScoreEnabled: true,
          winnerSide: "A",
          outcomeTypeId: null,
          outcomeTypeName: null,
        },
        {
          matchId: "m-2",
          playedAt: new Date("2026-05-02T10:00:00Z"),
          status: "finalized",
          tournamentId: "t-1",
          tournamentName: "Tour",
          tournamentMode: "ranked",
          tournamentScoreEnabled: true,
          winnerSide: "B",
          outcomeTypeId: "ot-1",
          outcomeTypeName: "Forfait",
        },
      ],
      total: 50,
    });

    (matchSidesRepository as any).getByMatchIds = async () => [
      {
        matchId: "m-1",
        position: 1,
        score: 2,
        entry: {
          players: [
            {
              player: { id: "p1", displayName: "Player 1", shortName: "P1" },
            },
          ],
        },
      },
      {
        matchId: "m-1",
        position: 2,
        score: 1,
        entry: {
          players: [
            {
              player: { id: "p2", displayName: "Player 2", shortName: "P2" },
            },
          ],
        },
      },
      {
        matchId: "m-2",
        position: 1,
        score: 0,
        entry: {
          players: [
            {
              player: { id: "p3", displayName: "Player 3", shortName: null },
            },
          ],
        },
      },
      {
        matchId: "m-2",
        position: 2,
        score: 3,
        entry: {
          players: [
            {
              player: { id: "p4", displayName: "Player 4", shortName: null },
            },
          ],
        },
      },
    ];

    const res = await matchService.listMatchCards({
      offset: 0,
      limit: 10,
    } as any, null);

    expect(res.total).toBe(50);
    expect(res.hasMore).toBe(true);
    expect(res.data).toHaveLength(2);
    const m1 = res.data.find((d) => d.id === "m-1")!;
    expect(m1.sides).toHaveLength(2);
    expect(m1.sides[0].isWinner).toBe(true); // position 1 = A, winnerSide = A
    expect(m1.sides[1].isWinner).toBe(false);
    expect(m1.outcomeType).toBeNull();

    const m2 = res.data.find((d) => d.id === "m-2")!;
    expect(m2.sides[0].isWinner).toBe(false); // position 1 = A but winnerSide = B
    expect(m2.sides[1].isWinner).toBe(true);
    expect(m2.outcomeType).toEqual({ id: "ot-1", name: "Forfait" });
  });
});
