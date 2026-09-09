import { z } from "zod";
import { validate } from "../api/validator";
import { describe } from "../api/describe";
import { tournamentService } from "../services/tournament.service";
import { standingsService } from "../services/standings.service";
import { bracketService } from "../services/bracket.service";
import { tournamentStatsService } from "../services/tournament-stats.service";
import { tournamentRulesetService } from "../services/tournament-ruleset.service";
import {
  createTournamentRequestSchema,
  updateTournamentSchema,
  changeTournamentStatusSchema,
  listTournamentsQuerySchema,
  joinTournamentSchema,
  adminAddParticipantSchema,
} from "../schemas/tournament.schema";
import {
  generateBracketSchema,
  baseTournamentSchema,
  tournamentWithStatsListSchema,
  joinTournamentResponseSchema,
  participantListItemSchema,
  standingsResultSchema,
  tournamentStatsSchema,
  bracketDataSchema,
  canGenerateBracketResponseSchema,
  availableBadgeSchema,
  mutationResultSchema,
  tournamentRulesetSchema,
  tournamentEditabilitySchema,
} from "@skol-arena/shared";
import { requireAuth } from "../middleware/auth";
import { userRepository } from "../repository/user.repository";
import { createAppHono } from "../types/hono";
import { rankedSeasonRepository } from "../repository/ranked-season.repository";
import { playerStatsService } from "../services/player-stats.service";
import { rulesService } from "../services/rules.service";
import { enqueueMmrSeasonRecalculation } from "../services/mmr-job-queue.service";

const tournaments = createAppHono();

const TAGS = ["Tournaments"];
const BRACKET_TAGS = ["Brackets"];

/**
 * Rejects a malformed tournament id before any query runs. Previously each route
 * repeated the same regex and answered with an ad-hoc body; going through the
 * validator gives them all the canonical error envelope instead.
 */
const tournamentIdParam = validate("param", z.object({ id: z.uuid() }));

/**
 * Resolves the optional session into an app user, then defers to the service.
 *
 * The rule itself lives in tournamentService.assertCanAccess: the team list, the
 * match routes and the WebSocket subscription need the same decision, and a copy
 * per call site is how the gaps appeared in the first place.
 */
async function assertTournamentAccess(
  betterAuthUserId: string | null | undefined,
  tournamentId: string,
): Promise<void> {
  const appUser = betterAuthUserId
    ? await userRepository.getByExternalId(betterAuthUserId)
    : null;

  await tournamentService.assertCanAccess(tournamentId, appUser?.id ?? null);
}

// POST /tournaments - Create new tournament
tournaments.post(
  "/",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Create a tournament",
    auth: true,
    success: { status: 201, description: "Tournament created", schema: baseTournamentSchema },
  }),
  validate("json", createTournamentRequestSchema),
  async (c) => {
    const appUserId = c.get("appUserId");
    const data = c.req.valid("json");

    const tournament = await tournamentService.createTournament({
      ...data,
      createdBy: appUserId,
    });

    return c.json(tournament, 201);
  }
);

// GET /tournaments - List all tournaments (with filters)
tournaments.get(
  "/",
  describe({
    tags: TAGS,
    summary: "List tournaments",
    description:
      "Tournaments scoped to an organization are only listed for its members; " +
      "signing in therefore widens the result.",
    success: {
      description: "Tournaments matching the filters, with participation counts",
      schema: tournamentWithStatsListSchema,
    },
  }),
  validate("query", listTournamentsQuerySchema),
  async (c) => {
    const filters = c.req.valid("query");
    const betterAuthUser = c.get("user");

    let appUser = null;
    if (betterAuthUser) {
      appUser = await userRepository.getByExternalId(betterAuthUser.id);
    }

    const tournamentsList = await tournamentService.listTournaments(filters, appUser);
    return c.json(tournamentsList);
  }
);

// GET /tournaments/:id - Get single tournament
tournaments.get(
  "/:id",
  describe({
    tags: TAGS,
    summary: "Get a tournament",
    role: true,
    notFound: true,
    success: { description: "The tournament", schema: baseTournamentSchema },
  }),
  tournamentIdParam,
  async (c) => {
    const id = c.req.param("id")!;
    await assertTournamentAccess(c.get("user")?.id, id);
    const tournament = await tournamentService.getTournamentById(id);
    return c.json(tournament);
  }
);

// GET /tournaments/:id/available-badges - badges earnable in this tournament
tournaments.get(
  "/:id/available-badges",
  describe({
    tags: TAGS,
    summary: "List the badges earnable in a tournament",
    role: true,
    notFound: true,
    success: {
      description: "Badges reachable given the tournament's discipline",
      schema: z.object({ badges: z.array(availableBadgeSchema) }),
    },
  }),
  tournamentIdParam,
  async (c) => {
    const id = c.req.param("id")!;
    await assertTournamentAccess(c.get("user")?.id, id);
    const tournament = await tournamentService.getTournamentById(id);
    const badges = await rulesService.listAvailableBadges(tournament?.disciplineId ?? null);
    return c.json({ badges });
  }
);

// PATCH /tournaments/:id - Update tournament
tournaments.patch(
  "/:id",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Update a tournament",
    auth: true,
    role: true,
    notFound: true,
    success: { description: "The updated tournament", schema: baseTournamentSchema },
  }),
  tournamentIdParam,
  validate("json", updateTournamentSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const appUserId = c.get("appUserId");
    const data = c.req.valid("json");

    const tournament = await tournamentService.updateTournament(
      id,
      appUserId,
      data
    );

    return c.json(tournament);
  }
);

// PATCH /tournaments/:id/status - Change tournament status
tournaments.patch(
  "/:id/status",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Change a tournament's status",
    auth: true,
    role: true,
    notFound: true,
    conflict: true,
    success: { description: "The tournament in its new status", schema: baseTournamentSchema },
  }),
  tournamentIdParam,
  validate("json", changeTournamentStatusSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const appUserId = c.get("appUserId");
    const { status } = c.req.valid("json");

    const tournament = await tournamentService.changeTournamentStatus(
      id,
      appUserId,
      status
    );

    return c.json(tournament);
  }
);

// DELETE /tournaments/:id - Delete tournament
tournaments.delete(
  "/:id",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Delete a tournament",
    auth: true,
    role: true,
    notFound: true,
    success: { description: "Deletion outcome", schema: mutationResultSchema },
  }),
  tournamentIdParam,
  async (c) => {
    const id = c.req.param("id")!;
    const appUserId = c.get("appUserId");

    const result = await tournamentService.deleteTournament(id, appUserId);
    return c.json(result);
  }
);

// POST /tournaments/:id/participants - Join tournament
tournaments.post(
  "/:id/participants",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Join a tournament",
    description:
      "A competition scoped to an organization only accepts entries from its members.",
    auth: true,
    role: true,
    notFound: true,
    conflict: true,
    success: {
      status: 201,
      description: "The participation that was created",
      schema: joinTournamentResponseSchema,
    },
  }),
  tournamentIdParam,
  validate("json", joinTournamentSchema),
  async (c) => {
    const tournamentId = c.req.param("id")!;
    const appUserId = c.get("appUserId");

    const participation = await tournamentService.joinTournament(appUserId, {
      tournamentId,
    });

    return c.json(participation, 201);
  }
);

// POST /tournaments/:id/participants/add - Admin adds a participant
tournaments.post(
  "/:id/participants/add",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Add a participant to a tournament",
    description: "Admin counterpart of joining: enters another user into the tournament.",
    auth: true,
    role: true,
    notFound: true,
    conflict: true,
    success: {
      status: 201,
      description: "The participation that was created",
      schema: joinTournamentResponseSchema,
    },
  }),
  tournamentIdParam,
  validate("json", adminAddParticipantSchema),
  async (c) => {
    const tournamentId = c.req.param("id")!;
    const appUserId = c.get("appUserId");
    const { userId: targetUserId } = c.req.valid("json");

    const participation = await tournamentService.adminAddParticipant(
      appUserId,
      tournamentId,
      targetUserId
    );

    return c.json(participation, 201);
  }
);

// DELETE /tournaments/:id/participants/:userId - Admin removes a participant
tournaments.delete(
  "/:id/participants/:userId",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Remove a participant from a tournament",
    auth: true,
    role: true,
    notFound: true,
    conflict: true,
    success: { description: "Removal outcome", schema: mutationResultSchema },
  }),
  tournamentIdParam,
  async (c) => {
    const tournamentId = c.req.param("id")!;
    const targetUserId = c.req.param("userId")!;
    const appUserId = c.get("appUserId");

    const result = await tournamentService.adminRemoveParticipant(
      appUserId,
      tournamentId,
      targetUserId
    );

    return c.json(result);
  }
);

// DELETE /tournaments/:id/participants - Leave tournament
tournaments.delete(
  "/:id/participants",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Leave a tournament",
    auth: true,
    notFound: true,
    conflict: true,
    success: { description: "Departure outcome", schema: mutationResultSchema },
  }),
  tournamentIdParam,
  async (c) => {
    const tournamentId = c.req.param("id")!;
    const appUserId = c.get("appUserId");

    const result = await tournamentService.leaveTournament(
      appUserId,
      tournamentId
    );

    return c.json(result);
  }
);

// GET /tournaments/:id/participants - Get tournament participants
tournaments.get(
  "/:id/participants",
  describe({
    tags: TAGS,
    summary: "List a tournament's participants",
    role: true,
    notFound: true,
    success: {
      description: "Participants with their user profile",
      schema: z.array(participantListItemSchema),
    },
  }),
  tournamentIdParam,
  async (c) => {
    const tournamentId = c.req.param("id")!;

    await assertTournamentAccess(c.get("user")?.id, tournamentId);
    const participants = await tournamentService.getTournamentParticipants(tournamentId);
    return c.json(participants);
  }
);

// GET /tournaments/:id/standings/official
tournaments.get(
  "/:id/standings/official",
  describe({
    tags: TAGS,
    summary: "Get official standings",
    description: "Finalized matches only. Cached; see DELETE /tournaments/{id}/cache.",
    role: true,
    notFound: true,
    success: { description: "The official standings", schema: standingsResultSchema },
  }),
  tournamentIdParam,
  async (c) => {
    const tournamentId = c.req.param("id")!;

    await assertTournamentAccess(c.get("user")?.id, tournamentId);
    const standings = await standingsService.getOfficialStandings(tournamentId);
    return c.json(standings);
  }
);

// GET /tournaments/:id/standings/provisional
tournaments.get(
  "/:id/standings/provisional",
  describe({
    tags: TAGS,
    summary: "Get provisional standings",
    description: "Includes matches that are reported but not yet finalized.",
    role: true,
    notFound: true,
    success: { description: "The provisional standings", schema: standingsResultSchema },
  }),
  tournamentIdParam,
  async (c) => {
    const tournamentId = c.req.param("id")!;

    await assertTournamentAccess(c.get("user")?.id, tournamentId);
    const standings = await standingsService.getProvisionalStandings(tournamentId);
    return c.json(standings);
  }
);

// GET /tournaments/:id/stats
tournaments.get(
  "/:id/stats",
  describe({
    tags: TAGS,
    summary: "Get tournament statistics",
    role: true,
    notFound: true,
    success: { description: "Aggregated statistics and leaderboards", schema: tournamentStatsSchema },
  }),
  tournamentIdParam,
  async (c) => {
    const tournamentId = c.req.param("id")!;
    await assertTournamentAccess(c.get("user")?.id, tournamentId);
    const stats = await tournamentStatsService.getStats(tournamentId);
    return c.json(stats);
  }
);

// DELETE /tournaments/:id/cache
tournaments.delete(
  "/:id/cache",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Clear cached standings and player stats",
    auth: true,
    role: true,
    notFound: true,
    success: { description: "Cache cleared", schema: mutationResultSchema },
  }),
  tournamentIdParam,
  async (c) => {
    const tournamentId = c.req.param("id")!;
    const appUserId = c.get("appUserId");
    await standingsService.clearCache(tournamentId, appUserId);
    await playerStatsService.invalidateCacheForTournament(tournamentId);
    return c.json({ success: true });
  }
);

// POST /tournaments/:id/recalculate-points
tournaments.post(
  "/:id/recalculate-points",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Recalculate awarded points",
    description:
      "Replays point attribution across the tournament. On a ranked tournament this " +
      "also queues an MMR season recalculation, which completes asynchronously.",
    auth: true,
    role: true,
    notFound: true,
    success: { description: "Recalculation outcome", schema: mutationResultSchema },
  }),
  tournamentIdParam,
  async (c) => {
    const tournamentId = c.req.param("id")!;
    const appUserId = c.get("appUserId");
    const result = await standingsService.recalculatePoints(tournamentId, appUserId);
    const rankedConfig = await rankedSeasonRepository.getConfigByTournamentId(tournamentId);
    if (rankedConfig) {
      await enqueueMmrSeasonRecalculation(tournamentId);
    }
    return c.json(result);
  }
);

// GET /tournaments/:id/editability
tournaments.get(
  "/:id/editability",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "What may still be edited on this competition",
    description:
      "Which fields the API will accept, which of them trigger a recalculation, and " +
      "which are locked — with the number of results already entered, so the form can " +
      "explain a refusal rather than just greying a field out.",
    auth: true,
    role: true,
    notFound: true,
    success: { description: "Editability of each field", schema: tournamentEditabilitySchema },
  }),
  tournamentIdParam,
  async (c) => {
    const tournamentId = c.req.param("id")!;
    await assertTournamentAccess(c.get("user")?.id, tournamentId);
    const editability = await tournamentService.getEditability(tournamentId);
    return c.json(editability);
  }
);

// GET /tournaments/:id/ruleset
tournaments.get(
  "/:id/ruleset",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Get the ruleset a competition is played under",
    description:
      "The discipline settings frozen when the competition opened: outcome types with " +
      "their points, MMR multipliers and reasons, plus the team interaction mode. This " +
      "is what match entry offers and what the calculations use — not the live discipline.",
    auth: true,
    role: true,
    notFound: true,
    success: { description: "The ruleset in force", schema: tournamentRulesetSchema },
  }),
  tournamentIdParam,
  async (c) => {
    const tournamentId = c.req.param("id")!;
    await assertTournamentAccess(c.get("user")?.id, tournamentId);
    const payload = await tournamentRulesetService.getForTournament(tournamentId);
    const row = await tournamentRulesetService.getRow(tournamentId);
    return c.json({
      payload,
      version: row?.version ?? 1,
      appliedAt: row?.appliedAt ?? new Date(),
      recalcPendingAt: row?.recalcPendingAt ?? null,
    });
  }
);

// ============================================
// Bracket Routes
// ============================================

// POST /tournaments/:id/bracket
tournaments.post(
  "/:id/bracket",
  requireAuth,
  describe({
    tags: BRACKET_TAGS,
    summary: "Generate a bracket",
    auth: true,
    role: true,
    notFound: true,
    conflict: true,
    success: { status: 201, description: "The generated bracket", schema: bracketDataSchema },
  }),
  tournamentIdParam,
  validate("json", generateBracketSchema),
  async (c) => {
    const tournamentId = c.req.param("id")!;
    const appUserId = c.get("appUserId");
    const data = c.req.valid("json");

    const bracket = await bracketService.generateBracket(
      tournamentId,
      data,
      appUserId
    );

    return c.json(bracket, 201);
  }
);

// GET /tournaments/:id/bracket
tournaments.get(
  "/:id/bracket",
  describe({
    tags: BRACKET_TAGS,
    summary: "Get a tournament's bracket",
    role: true,
    notFound: true,
    success: { description: "Config, rounds, seeds and matches", schema: bracketDataSchema },
  }),
  tournamentIdParam,
  async (c) => {
    const tournamentId = c.req.param("id")!;
    await assertTournamentAccess(c.get("user")?.id, tournamentId);
    const bracket = await bracketService.getBracketData(tournamentId);

    if (!bracket) {
      return c.json({ error: "No bracket found for this tournament" }, 404);
    }

    return c.json(bracket);
  }
);

// GET /tournaments/:id/bracket/can-generate
tournaments.get(
  "/:id/bracket/can-generate",
  describe({
    tags: BRACKET_TAGS,
    summary: "Check whether a bracket can be generated",
    description: "Answers 200 with canGenerate false and a reason rather than failing.",
    role: true,
    notFound: true,
    success: {
      description: "Whether generation is possible, and why not if it is not",
      schema: canGenerateBracketResponseSchema,
    },
  }),
  tournamentIdParam,
  async (c) => {
    const tournamentId = c.req.param("id")!;
    await assertTournamentAccess(c.get("user")?.id, tournamentId);
    const result = await bracketService.canGenerateBracket(tournamentId);
    return c.json(result);
  }
);

// DELETE /tournaments/:id/bracket
tournaments.delete(
  "/:id/bracket",
  requireAuth,
  describe({
    tags: BRACKET_TAGS,
    summary: "Delete a bracket",
    auth: true,
    role: true,
    notFound: true,
    conflict: true,
    success: { description: "Deletion outcome", schema: mutationResultSchema },
  }),
  tournamentIdParam,
  async (c) => {
    const tournamentId = c.req.param("id")!;
    const appUserId = c.get("appUserId");

    await bracketService.deleteBracket(tournamentId, appUserId);

    return c.json({ success: true, message: "Bracket deleted successfully" });
  }
);

export default tournaments;
