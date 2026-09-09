/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "bun:test";

// Import the CLASS (not the singleton) to avoid test pollution from other test files' mock.module
import { TournamentService } from "../tournament.service";
import {
  tournamentRepository,
  TournamentRepository,
  CreateTournamentData,
  UpdateTournamentData,
} from "../../repository/tournament.repository";
import {
  participantRepository,
  ParticipantRepository,
} from "../../repository/participant.repository";
import {
  userRepository,
  UserRepository,
} from "../../repository/user.repository";
import {
  organizationRepository,
  OrganizationRepository,
} from "../../repository/organization.repository";
import { tournamentRulesetService } from "../tournament-ruleset.service";
import { matchRepository } from "../../repository/match.repository";
import { standingsService } from "../standings.service";
import { playerStatsService } from "../player-stats.service";
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
  ConflictError,
  ErrorCode,
} from "../../types/errors";
import type {
  CreateTournamentInput,
  UpdateTournamentInput,
  TournamentStatus,
  TournamentMode,
  JoinTournamentRequest,
} from "@skol-arena/shared";

// Create a fresh instance to avoid pollution from other test files' mock.module
const tournamentService = new TournamentService();

let tourRepo: Partial<TournamentRepository>;
let partRepo: Partial<ParticipantRepository>;
let usrRepo: Partial<UserRepository>;
let orgRepo: Partial<OrganizationRepository>;

/** Entered results the service should see; set per test. */
let enteredMatchCount = 0;
/** Tournaments a rule change asked to recompute. */
let recalculatedTournamentIds: string[] = [];

beforeEach(() => {
  // Snapshot lifecycle is covered by the ruleset tests; here it would only reach
  // for a database.
  tournamentRulesetService.seed = async () => ({ discipline: null, outcomeTypes: [] });
  tournamentRulesetService.freeze = async () => undefined;

  enteredMatchCount = 0;
  recalculatedTournamentIds = [];
  matchRepository.countEnteredMatches = async () => enteredMatchCount;
  standingsService.recalculatePointsInternal = async (tournamentId: string) => {
    recalculatedTournamentIds.push(tournamentId);
    return { updatedMatches: 0 };
  };
  playerStatsService.invalidateCacheForTournament = async () => undefined;

  tourRepo = tournamentRepository as unknown as Partial<TournamentRepository>;
  tourRepo.getById = async (_id: string) => undefined;
  tourRepo.create = async (data: CreateTournamentData) =>
    ({ id: "t-1", ...data }) as any;
  tourRepo.update = async (_id: string, data: UpdateTournamentData) =>
    ({ id: _id, ...data }) as any;
  tourRepo.delete = async () => undefined;
  tourRepo.list = async () => [];
  tourRepo.countByUserAndStatus = async () => 0;
  tourRepo.isUserTournamentAdmin = async () => false;
  tourRepo.addAdmin = async () => undefined;
  tourRepo.getUser = async (_id: string) => undefined;

  partRepo = participantRepository as unknown as Partial<ParticipantRepository>;
  partRepo.findTournamentById = async (_id: string) => undefined as any;
  partRepo.findParticipationByUserAndTournament = async () => undefined as any;
  partRepo.createParticipation = async (
    _userId: string,
    _tournamentId: string,
  ) => ({ id: "p-1", userId: _userId, tournamentId: _tournamentId }) as any;
  partRepo.findParticipationWithDetails = async (_id: string) =>
    ({ id: _id }) as any;
  partRepo.deleteParticipation = async () => undefined;
  partRepo.findTournamentParticipants = async () => [];

  orgRepo = organizationRepository as unknown as Partial<OrganizationRepository>;
  orgRepo.isMember = async () => false;
  orgRepo.getUserOrganizationIds = async () => [];

  usrRepo = userRepository as unknown as Partial<UserRepository>;
  usrRepo.getById = async (id: string) =>
    ({
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
      externalId: "",
      displayName: "",
      role: "player",
    }) as any;
});

describe("TournamentService - organization access", () => {
  /** The rule only ever looks at the organization id, so the row can stay minimal. */
  const openTournament = { id: "t-1", organizationId: null };
  const scopedTournament = { id: "t-1", organizationId: "org-1" };

  it("lets anyone read a tournament attached to no organization", async () => {
    await expect(
      tournamentService.assertOrganizationAccess(openTournament.organizationId, null),
    ).resolves.toBeUndefined();
  });

  it("refuses an anonymous reader on a scoped tournament", async () => {
    await expect(
      tournamentService.assertOrganizationAccess(scopedTournament.organizationId, null),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses a signed-in reader who is not a member", async () => {
    usrRepo.getById = async () => ({ id: "u-1", role: "player" }) as any;
    orgRepo.isMember = async () => false;

    await expect(
      tournamentService.assertOrganizationAccess(scopedTournament.organizationId, "u-1"),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets a member of the organization through", async () => {
    usrRepo.getById = async () => ({ id: "u-1", role: "player" }) as any;
    orgRepo.isMember = async () => true;

    await expect(
      tournamentService.assertOrganizationAccess(scopedTournament.organizationId, "u-1"),
    ).resolves.toBeUndefined();
  });

  it("lets a super_admin through without checking membership", async () => {
    usrRepo.getById = async () => ({ id: "u-1", role: "super_admin" }) as any;
    orgRepo.isMember = async () => {
      throw new Error("membership should not be consulted for a super admin");
    };

    await expect(
      tournamentService.assertOrganizationAccess(scopedTournament.organizationId, "u-1"),
    ).resolves.toBeUndefined();
  });

  it("refuses a caller whose app user no longer exists", async () => {
    usrRepo.getById = async () => undefined as any;

    await expect(
      tournamentService.assertOrganizationAccess(scopedTournament.organizationId, "u-gone"),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses joining a tournament scoped to an organization the user is not in", async () => {
    partRepo.findTournamentById = async () =>
      ({ id: "t-1", status: "open", organizationId: "org-1" }) as any;
    usrRepo.getById = async () => ({ id: "u-1", role: "player" }) as any;
    orgRepo.isMember = async () => false;

    await expect(
      tournamentService.joinTournament("u-1", {
        tournamentId: "t-1",
      } as JoinTournamentRequest),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("TournamentService - basic flows", () => {
  it("canManageTournament should return true for super_admin", async () => {
    usrRepo.getById = async () => ({ id: "u-1", role: "super_admin" }) as any;
    const res = await tournamentService.canManageTournament("t-1", "u-1");
    expect(res).toBe(true);
  });

  it("canManageTournament should return true for tournament admin", async () => {
    usrRepo.getById = async () => ({ id: "u-1", role: "player" }) as any;
    tourRepo.isUserTournamentAdmin = async () => true;
    const res = await tournamentService.canManageTournament("t-1", "u-1");
    expect(res).toBe(true);
  });

  it("canManageTournament should return false for regular player", async () => {
    usrRepo.getById = async () => ({ id: "u-1", role: "player" }) as any;
    tourRepo.isUserTournamentAdmin = async () => false;
    const res = await tournamentService.canManageTournament("t-1", "u-1");
    expect(res).toBe(false);
  });

  it("canCreateTournament should return true for tournament_admin", async () => {
    usrRepo.getById = async () =>
      ({ id: "u-1", role: "tournament_admin" }) as any;
    const res = await tournamentService.canCreateTournament("u-1");
    expect(res).toBe(true);
  });

  it("canCreateTournament should return true for super_admin", async () => {
    usrRepo.getById = async () => ({ id: "u-1", role: "super_admin" }) as any;
    const res = await tournamentService.canCreateTournament("u-1");
    expect(res).toBe(true);
  });

  it("canCreateTournament should return false for player", async () => {
    usrRepo.getById = async () => ({ id: "u-1", role: "player" }) as any;
    const res = await tournamentService.canCreateTournament("u-1");
    expect(res).toBe(false);
  });

  it("countDraftTournaments should return count from repository", async () => {
    tourRepo.countByUserAndStatus = async () => 3;
    const res = await tournamentService.countDraftTournaments("u-1");
    expect(res).toBe(3);
  });

  it("createTournament should throw ForbiddenError when user cannot create", async () => {
    usrRepo.getById = async () => ({ id: "u-1", role: "player" }) as any;
    try {
      await tournamentService.createTournament({
        createdBy: "u-1",
        name: "Test",
        mode: "championship",
        teamMode: "flex",
        minTeamSize: 1,
        maxTeamSize: 2,
        startDate: "2024-01-01",
        endDate: "2024-01-02",
      } as CreateTournamentInput);
      throw new Error("Expected ForbiddenError");
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
    }
  });

  it("createTournament should throw ConflictError when max drafts exceeded", async () => {
    usrRepo.getById = async () =>
      ({ id: "u-1", role: "tournament_admin" }) as any;
    tourRepo.countByUserAndStatus = async () => 5;
    try {
      await tournamentService.createTournament({
        createdBy: "u-1",
        name: "Test",
        mode: "championship",
        teamMode: "flex",
        minTeamSize: 1,
        maxTeamSize: 2,
        startDate: "2024-01-01",
        endDate: "2024-01-02",
      } as CreateTournamentInput);
      throw new Error("Expected ConflictError");
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
    }
  });

  it("createTournament should throw BadRequestError when startDate >= endDate", async () => {
    usrRepo.getById = async () =>
      ({ id: "u-1", role: "tournament_admin" }) as any;
    tourRepo.countByUserAndStatus = async () => 0;
    try {
      await tournamentService.createTournament({
        createdBy: "u-1",
        name: "Test",
        mode: "championship",
        teamMode: "flex",
        minTeamSize: 1,
        maxTeamSize: 2,
        startDate: "2024-01-02",
        endDate: "2024-01-01",
      } as CreateTournamentInput);
      throw new Error("Expected BadRequestError");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
    }
  });

  it("createTournament should throw BadRequestError when minTeamSize < 1", async () => {
    usrRepo.getById = async () =>
      ({ id: "u-1", role: "tournament_admin" }) as any;
    tourRepo.countByUserAndStatus = async () => 0;
    try {
      await tournamentService.createTournament({
        createdBy: "u-1",
        name: "Test",
        mode: "championship",
        teamMode: "flex",
        minTeamSize: 0,
        maxTeamSize: 2,
        startDate: "2024-01-01",
        endDate: "2024-01-02",
      } as CreateTournamentInput);
      throw new Error("Expected BadRequestError");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
    }
  });

  it("createTournament should throw BadRequestError when maxTeamSize < minTeamSize", async () => {
    usrRepo.getById = async () =>
      ({ id: "u-1", role: "tournament_admin" }) as any;
    tourRepo.countByUserAndStatus = async () => 0;
    try {
      await tournamentService.createTournament({
        createdBy: "u-1",
        name: "Test",
        mode: "championship",
        teamMode: "flex",
        minTeamSize: 2,
        maxTeamSize: 1,
        startDate: "2024-01-01",
        endDate: "2024-01-02",
      } as CreateTournamentInput);
      throw new Error("Expected BadRequestError");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
    }
  });

  it("createTournament should create tournament and add creator as owner", async () => {
    usrRepo.getById = async () =>
      ({ id: "u-1", role: "tournament_admin" }) as any;
    tourRepo.countByUserAndStatus = async () => 0;
    tourRepo.create = async (data: CreateTournamentData) =>
      ({ id: "t-new", ...data }) as any;
    let addedAdminTournamentId: string | null = null;
    let addedAdminUserId: string | null = null;
    tourRepo.addAdmin = async (tournamentId: string, userId: string) => {
      addedAdminTournamentId = tournamentId;
      addedAdminUserId = userId;
    };

    const input: CreateTournamentInput = {
      createdBy: "u-1",
      name: "Test Tournament",
      mode: "championship",
      teamMode: "flex",
      minTeamSize: 1,
      maxTeamSize: 2,
      startDate: "2024-01-01",
      endDate: "2024-01-02",
    } as CreateTournamentInput;

    const result = await tournamentService.createTournament(input);
    expect(result).toBeTruthy();
    expect(result?.id).toBe("t-new");
    expect(addedAdminTournamentId).not.toBeNull();
    expect(addedAdminTournamentId!).toBe("t-new");
    expect(addedAdminUserId).not.toBeNull();
    expect(addedAdminUserId!).toBe("u-1");
  });

  it("createTournament should succeed when maxTeamSize equals minTeamSize (solo tournaments)", async () => {
    usrRepo.getById = async () =>
      ({ id: "u-1", role: "tournament_admin" }) as any;
    tourRepo.countByUserAndStatus = async () => 0;
    tourRepo.create = async (data: CreateTournamentData) =>
      ({ id: "t-solo", ...data }) as any;
    let addedAdminTournamentId: string | null = null;
    tourRepo.addAdmin = async (tournamentId: string) => {
      addedAdminTournamentId = tournamentId;
    };

    const input: CreateTournamentInput = {
      createdBy: "u-1",
      name: "Solo Tournament",
      mode: "bracket",
      teamMode: "flex",
      minTeamSize: 1,
      maxTeamSize: 1,
      startDate: "2024-01-01",
      endDate: "2024-01-02",
    } as CreateTournamentInput;

    const result = await tournamentService.createTournament(input);
    expect(result).toBeTruthy();
    expect(result?.id).toBe("t-solo");
    expect(addedAdminTournamentId).not.toBeNull();
    expect(addedAdminTournamentId!).toBe("t-solo");
  });

  it("getTournamentById should throw NotFoundError when tournament not found", async () => {
    tourRepo.getById = async () => undefined;
    try {
      await tournamentService.getTournamentById("t-not-exist");
      throw new Error("Expected NotFoundError");
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundError);
    }
  });

  it("getTournamentById should return tournament when exists", async () => {
    tourRepo.getById = async () =>
      ({ id: "t-1", name: "Test Tournament" }) as any;
    const res = await tournamentService.getTournamentById("t-1");
    expect(res).toBeTruthy();
    expect(res.id).toBe("t-1");
  });

  it("listTournaments should return results from repository", async () => {
    tourRepo.list = async (filters?: {
      status?: TournamentStatus;
      mode?: TournamentMode;
      createdBy?: string;
    }) => [{ id: "t-1", status: filters?.status } as any];
    const res = await tournamentService.listTournaments({ status: "open" });
    expect(Array.isArray(res)).toBe(true);
    expect(res[0].status).toBe("open");
  });

  it("updateTournament should throw ForbiddenError when user cannot manage", async () => {
    usrRepo.getById = async () => ({ id: "u-1", role: "player" }) as any;
    tourRepo.isUserTournamentAdmin = async () => false;
    tourRepo.getById = async () => ({ id: "t-1", status: "draft" }) as any;
    try {
      await tournamentService.updateTournament("t-1", "u-1", {
        name: "New Name",
      } as UpdateTournamentInput);
      throw new Error("Expected ForbiddenError");
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
    }
  });

  /**
   * What a competition still allows once it has left draft. The policy itself is
   * unit-tested in the shared module; these check that the service enforces it,
   * distinguishes its two refusals, and follows through on a rule change.
   */
  describe("updateTournament editability", () => {
    function openTournament(overrides: Record<string, unknown> = {}) {
      usrRepo.getById = async () => ({ id: "u-1", role: "super_admin" }) as any;
      tourRepo.getById = async () =>
        ({
          id: "t-1",
          status: "open",
          mode: "championship",
          teamMode: "flex",
          startDate: "2024-01-01",
          endDate: "2024-01-02",
          minTeamSize: 1,
          maxTeamSize: 2,
          ...overrides,
        }) as any;
    }

    async function expectRejected(input: UpdateTournamentInput, code: ErrorCode) {
      const err = await tournamentService
        .updateTournament("t-1", "u-1", input)
        .then(() => null)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(BadRequestError);
      expect((err as BadRequestError).code).toBe(code);
    }

    it("accepts metadata, which never weighs on a result", async () => {
      openTournament();
      enteredMatchCount = 12;

      const updated = await tournamentService.updateTournament("t-1", "u-1", {
        name: "New Name",
        description: "Nouvelle description",
      } as UpdateTournamentInput);

      expect(updated).toBeDefined();
    });

    it("refuses a structural field outright", async () => {
      openTournament();
      enteredMatchCount = 0;

      await expectRejected(
        { mode: "bracket" } as UpdateTournamentInput,
        ErrorCode.TOURNAMENT_FIELD_UPDATE_FORBIDDEN,
      );
    });

    it("allows scoring semantics while nothing has been entered", async () => {
      openTournament();
      enteredMatchCount = 0;

      const updated = await tournamentService.updateTournament("t-1", "u-1", {
        scoreEnabled: false,
      } as UpdateTournamentInput);

      expect(updated).toBeDefined();
    });

    it("locks scoring semantics once a result exists, and says how many", async () => {
      openTournament();
      enteredMatchCount = 3;

      const err = await tournamentService
        .updateTournament("t-1", "u-1", { scoreEnabled: false } as UpdateTournamentInput)
        .then(() => null)
        .catch((e: unknown) => e);

      expect((err as BadRequestError).code).toBe(ErrorCode.TOURNAMENT_FIELD_LOCKED_BY_MATCHES);
      expect((err as BadRequestError).details).toMatchObject({ matchCount: 3 });
    });

    it("recalculates when the points scale moves", async () => {
      openTournament();
      enteredMatchCount = 5;

      await tournamentService.updateTournament("t-1", "u-1", {
        scoringConfig: { pointPerVictory: 5 },
      } as UpdateTournamentInput);

      expect(recalculatedTournamentIds).toEqual(["t-1"]);
    });

    it("does not recalculate when only metadata changes", async () => {
      openTournament();
      enteredMatchCount = 5;

      await tournamentService.updateTournament("t-1", "u-1", {
        description: "Juste un texte",
      } as UpdateTournamentInput);

      expect(recalculatedTournamentIds).toEqual([]);
    });

    it("allows team sizes to be widened in flex, but not in static", async () => {
      openTournament({ teamMode: "flex" });
      enteredMatchCount = 4;
      await tournamentService.updateTournament("t-1", "u-1", {
        maxTeamSize: 3,
      } as UpdateTournamentInput);

      openTournament({ teamMode: "static" });
      await expectRejected(
        { maxTeamSize: 3 } as UpdateTournamentInput,
        ErrorCode.TOURNAMENT_FIELD_UPDATE_FORBIDDEN,
      );
    });

    it("validates the status transition on the generic update route", async () => {
      // The admin form patches `status` here rather than through the dedicated
      // status route, so without this any transition was reachable.
      openTournament({ status: "finished" });
      enteredMatchCount = 0;

      await expectRejected(
        { status: "draft" } as UpdateTournamentInput,
        ErrorCode.INVALID_STATUS_TRANSITION,
      );
    });

    it("allows a legal transition through the same route", async () => {
      openTournament({ status: "open" });
      enteredMatchCount = 0;

      const updated = await tournamentService.updateTournament("t-1", "u-1", {
        status: "ongoing",
      } as UpdateTournamentInput);

      expect(updated).toBeDefined();
    });
  });

  it("updateTournament should throw BadRequestError when invalid date range", async () => {
    usrRepo.getById = async () => ({ id: "u-1", role: "super_admin" }) as any;
    tourRepo.getById = async () =>
      ({
        id: "t-1",
        status: "draft",
        startDate: "2024-01-01",
        endDate: "2024-01-02",
      }) as any;
    try {
      await tournamentService.updateTournament("t-1", "u-1", {
        startDate: "2024-01-02",
        endDate: "2024-01-01",
      } as UpdateTournamentInput);
      throw new Error("Expected BadRequestError");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
    }
  });

  it("updateTournament should throw BadRequestError when invalid team size", async () => {
    usrRepo.getById = async () => ({ id: "u-1", role: "super_admin" }) as any;
    tourRepo.getById = async () =>
      ({
        id: "t-1",
        status: "draft",
        minTeamSize: 1,
        maxTeamSize: 2,
      }) as any;
    try {
      await tournamentService.updateTournament("t-1", "u-1", {
        minTeamSize: 0,
      } as UpdateTournamentInput);
      throw new Error("Expected BadRequestError");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
    }
  });

  it("updateTournament should succeed when valid", async () => {
    usrRepo.getById = async () => ({ id: "u-1", role: "super_admin" }) as any;
    tourRepo.getById = async () =>
      ({
        id: "t-1",
        status: "draft",
        startDate: "2024-01-01",
        endDate: "2024-01-02",
        minTeamSize: 1,
        maxTeamSize: 2,
      }) as any;
    tourRepo.update = async (_id: string, data: UpdateTournamentData) =>
      ({ id: _id, ...data }) as any;
    const res = await tournamentService.updateTournament("t-1", "u-1", {
      name: "Updated Name",
    } as UpdateTournamentInput);
    expect(res.name).toBe("Updated Name");
  });

  it("deleteTournament should throw NotFoundError when user not found", async () => {
    tourRepo.getUser = async () => undefined;
    try {
      await tournamentService.deleteTournament("t-1", "u-1");
      throw new Error("Expected NotFoundError");
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundError);
    }
  });

  it("deleteTournament should throw ForbiddenError when user is not owner or super_admin", async () => {
    tourRepo.getUser = async () => ({ id: "u-1", role: "player" }) as any;
    tourRepo.getById = async () => ({ id: "t-1", createdBy: "u-2" }) as any;
    try {
      await tournamentService.deleteTournament("t-1", "u-1");
      throw new Error("Expected ForbiddenError");
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
    }
  });

  it("deleteTournament should throw BadRequestError when tournament not in draft", async () => {
    tourRepo.getUser = async () => ({ id: "u-1", role: "super_admin" }) as any;
    tourRepo.getById = async () =>
      ({ id: "t-1", createdBy: "u-1", status: "open" }) as any;
    try {
      await tournamentService.deleteTournament("t-1", "u-1");
      throw new Error("Expected BadRequestError");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
    }
  });

  it("deleteTournament should succeed when super_admin deletes", async () => {
    tourRepo.getUser = async () => ({ id: "u-1", role: "super_admin" }) as any;
    tourRepo.getById = async () =>
      ({ id: "t-1", createdBy: "u-2", status: "draft" }) as any;
    let deletedId: string | null = null;
    tourRepo.delete = async (id: string) => {
      deletedId = id;
    };
    const res = await tournamentService.deleteTournament("t-1", "u-1");
    expect(res.success).toBe(true);
    expect(deletedId).not.toBeNull();
    expect(deletedId!).toBe("t-1");
  });

  it("deleteTournament should succeed when owner deletes", async () => {
    tourRepo.getUser = async () => ({ id: "u-1", role: "player" }) as any;
    tourRepo.getById = async () =>
      ({ id: "t-1", createdBy: "u-1", status: "draft" }) as any;
    let deletedId: string | null = null;
    tourRepo.delete = async (id: string) => {
      deletedId = id;
    };
    const res = await tournamentService.deleteTournament("t-1", "u-1");
    expect(res.success).toBe(true);
    expect(deletedId).not.toBeNull();
    expect(deletedId!).toBe("t-1");
  });

  it("changeTournamentStatus should throw ForbiddenError when user cannot manage", async () => {
    usrRepo.getById = async () => ({ id: "u-1", role: "player" }) as any;
    tourRepo.isUserTournamentAdmin = async () => false;
    tourRepo.getById = async () => ({ id: "t-1", status: "draft" }) as any;
    try {
      await tournamentService.changeTournamentStatus("t-1", "u-1", "open");
      throw new Error("Expected ForbiddenError");
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
    }
  });

  it("changeTournamentStatus should throw BadRequestError when invalid transition", async () => {
    usrRepo.getById = async () => ({ id: "u-1", role: "super_admin" }) as any;
    tourRepo.getById = async () => ({ id: "t-1", status: "draft" }) as any;
    try {
      await tournamentService.changeTournamentStatus("t-1", "u-1", "finished");
      throw new Error("Expected BadRequestError");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
    }
  });

  it("changeTournamentStatus should succeed when valid transition", async () => {
    usrRepo.getById = async () => ({ id: "u-1", role: "super_admin" }) as any;
    tourRepo.getById = async () => ({ id: "t-1", status: "draft" }) as any;
    tourRepo.update = async (_id: string, data: UpdateTournamentData) =>
      ({ id: _id, ...data }) as any;
    const res = await tournamentService.changeTournamentStatus(
      "t-1",
      "u-1",
      "open",
    );
    expect(res.status).toBe("open");
  });

  it("joinTournament should throw NotFoundError when tournament not found", async () => {
    partRepo.findTournamentById = async () => undefined as any;
    try {
      await tournamentService.joinTournament("u-1", {
        tournamentId: "t-not-exist",
      } as JoinTournamentRequest);
      throw new Error("Expected NotFoundError");
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundError);
    }
  });

  it("joinTournament should throw BadRequestError when tournament closed", async () => {
    partRepo.findTournamentById = async () =>
      ({ id: "t-1", status: "finished" }) as any;
    try {
      await tournamentService.joinTournament("u-1", {
        tournamentId: "t-1",
      } as JoinTournamentRequest);
      throw new Error("Expected BadRequestError");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
    }
  });

  it("joinTournament should throw ConflictError when already registered", async () => {
    partRepo.findTournamentById = async () =>
      ({ id: "t-1", status: "open" }) as any;
    partRepo.findParticipationByUserAndTournament = async () =>
      ({
        id: "p-1",
        tournamentId: "t-1",
        userId: "u-1",
        teamId: null,
        matchesPlayed: 0,
        joinedAt: new Date(),
      }) as any;
    try {
      await tournamentService.joinTournament("u-1", {
        tournamentId: "t-1",
      } as JoinTournamentRequest);
      throw new Error("Expected ConflictError");
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
    }
  });

  it("joinTournament should create participation when valid", async () => {
    partRepo.findTournamentById = async () =>
      ({ id: "t-1", status: "open" }) as any;
    partRepo.findParticipationByUserAndTournament = async () =>
      undefined as any;
    partRepo.createParticipation = async (
      userId: string,
      tournamentId: string,
    ) => ({ id: "p-new", userId, tournamentId }) as any;
    partRepo.findParticipationWithDetails = async () =>
      ({ id: "p-new", userId: "u-1", tournamentId: "t-1" }) as any;
    const res = await tournamentService.joinTournament("u-1", {
      tournamentId: "t-1",
    } as JoinTournamentRequest);
    expect(res).toBeTruthy();
    expect(res!.userId).toBe("u-1");
  });

  it("leaveTournament should throw NotFoundError when tournament not found", async () => {
    partRepo.findTournamentById = async () => undefined as any;
    try {
      await tournamentService.leaveTournament("u-1", "t-not-exist");
      throw new Error("Expected NotFoundError");
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundError);
    }
  });

  it("leaveTournament should throw BadRequestError when tournament ongoing or finished", async () => {
    partRepo.findTournamentById = async () =>
      ({ id: "t-1", status: "ongoing" }) as any;
    try {
      await tournamentService.leaveTournament("u-1", "t-1");
      throw new Error("Expected BadRequestError");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
    }
  });

  it("leaveTournament should throw BadRequestError when not registered", async () => {
    partRepo.findTournamentById = async () =>
      ({ id: "t-1", status: "open" }) as any;
    partRepo.findParticipationByUserAndTournament = async () =>
      undefined as any;
    try {
      await tournamentService.leaveTournament("u-1", "t-1");
      throw new Error("Expected BadRequestError");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
    }
  });

  it("leaveTournament should delete participation when valid", async () => {
    partRepo.findTournamentById = async () =>
      ({ id: "t-1", status: "open" }) as any;
    partRepo.findParticipationByUserAndTournament = async () =>
      ({ id: "p-1" }) as any;
    let deletedId: string | null = null;
    partRepo.deleteParticipation = async (id: string) => {
      deletedId = id;
    };
    const res = await tournamentService.leaveTournament("u-1", "t-1");
    expect(res.message).toContain("quitté");
    expect(deletedId).not.toBeNull();
    expect(deletedId!).toBe("p-1");
  });

  it("getTournamentParticipants should return results from repository", async () => {
    partRepo.findTournamentParticipants = async () => [
      { id: "p-1", userId: "u-1" } as any,
    ];
    const res = await tournamentService.getTournamentParticipants("t-1");
    expect(Array.isArray(res)).toBe(true);
    expect(res[0].userId).toBe("u-1");
  });
});
