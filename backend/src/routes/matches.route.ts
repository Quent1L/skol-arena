import { validate } from "../api/validator";
import { describe } from "../api/describe";
import { matchService } from "../services/match.service";
import { matchMessageService } from "../services/match-message.service";
import {
  createMatchSchema,
  postMatchMessageSchema,
  updateMatchSchema,
  reportMatchResultSchema,
  confirmMatchSchema,
  contestMatchSchema,
  respondToMatchSchema,
  finalizeMatchSchema,
  listMatchCardsQuerySchema,
  validateMatchSchema,
  matchModelSchema,
  paginatedMatchCardsSchema,
  clientMatchMessageSchema,
  clientMatchMessageListSchema,
  validateMatchResponseSchema,
  autoFinalizeResponseSchema,
  mutationResultSchema,
} from "@skol-arena/shared/types/index";
import { requireAuth, resolveOptionalViewer } from "../middleware/auth";
import { requireSuperAdmin } from "../middleware/require-role";
import { rateLimit } from "../middleware/rate-limit";
import { tournamentService } from "../services/tournament.service";
import { createAppHono } from "../types/hono";
import { ErrorCode, ForbiddenError } from "../types/errors";

const matches = createAppHono();

const TAGS = ["Matches"];

// POST /matches - Create new match
matches.post(
  "/",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Create a match",
    auth: true,
    role: true,
    notFound: true,
    conflict: true,
    success: { status: 201, description: "Match created", schema: matchModelSchema },
  }),
  validate("json", createMatchSchema),
  async (c) => {
    const appUserId = c.get("appUserId");
    const data = c.req.valid("json");

    const match = await matchService.createMatch(data, appUserId);

    return c.json(match, 201);
  }
);

// GET /matches - Paginated lean match list (with filters)
matches.get(
  "/",
  describe({
    tags: TAGS,
    summary: "List matches",
    description:
      "Lean paginated cards, not full match models. Use GET /matches/{id} for detail. " +
      "Matches played in a competition scoped to an organization are only listed for " +
      "its members, so signing in widens the result.",
    success: { description: "A page of match cards", schema: paginatedMatchCardsSchema },
  }),
  validate("query", listMatchCardsQuerySchema),
  async (c) => {
    const filters = c.req.valid("query");
    const result = await matchService.listMatchCards(filters, await resolveOptionalViewer(c));
    return c.json(result);
  }
);

// GET /matches/:id - Get single match
matches.get(
  "/:id",
  describe({
    tags: TAGS,
    summary: "Get a match",
    description:
      "Public for an open competition; a match played in a competition scoped to an " +
      "organization is only readable by its members.",
    role: true,
    notFound: true,
    success: { description: "The match with its relations", schema: matchModelSchema },
  }),
  async (c) => {
    const id = c.req.param("id")!;
    const match = await matchService.getMatchById(id);
    await tournamentService.assertCanAccess(match.tournamentId, await resolveOptionalViewer(c));
    return c.json(match);
  }
);

// PATCH /matches/:id - Update match
matches.patch(
  "/:id",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Update a match",
    auth: true,
    role: true,
    notFound: true,
    conflict: true,
    success: { description: "The updated match", schema: matchModelSchema },
  }),
  validate("json", updateMatchSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const appUserId = c.get("appUserId");
    const data = c.req.valid("json");

    const match = await matchService.updateMatch(
      id,
      {
        round: data.round,
        scoreA: data.scoreA,
        scoreB: data.scoreB,
        status: data.status,
        reportProof: data.reportProof,
        outcomeTypeId: data.outcomeTypeId,
        outcomeReasonId: data.outcomeReasonId,
        winnerPosition: data.winnerPosition,
        playedAt: data.playedAt,
      },
      appUserId
    );

    return c.json(match);
  }
);

// DELETE /matches/:id - Delete match
matches.delete(
  "/:id",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Delete a match",
    auth: true,
    role: true,
    notFound: true,
    success: { description: "Deletion outcome", schema: mutationResultSchema },
  }),
  async (c) => {
    const id = c.req.param("id")!;
    const appUserId = c.get("appUserId");

    const result = await matchService.deleteMatch(id, appUserId);
    return c.json(result);
  }
);

// POST /matches/:id/report - Report match result
matches.post(
  "/:id/report",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Report a match result",
    description: "Records the score. Participants then confirm or dispute it.",
    auth: true,
    role: true,
    notFound: true,
    conflict: true,
    success: { description: "The match after the change", schema: matchModelSchema },
  }),
  validate("json", reportMatchResultSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const appUserId = c.get("appUserId");
    const data = c.req.valid("json");

    const match = await matchService.reportMatchResult(
      id,
      {
        scoreA: data.scoreA,
        scoreB: data.scoreB,
        reportProof: data.reportProof,
        winnerPosition: data.winnerPosition,
        outcomeTypeId: data.outcomeTypeId,
        outcomeReasonId: data.outcomeReasonId,
      },
      appUserId
    );

    return c.json(match);
  }
);

// POST /matches/:id/confirm - Confirm match result
matches.post(
  "/:id/confirm",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Confirm a reported result",
    auth: true,
    role: true,
    notFound: true,
    conflict: true,
    success: { description: "The match after the change", schema: matchModelSchema },
  }),
  validate("json", confirmMatchSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const appUserId = c.get("appUserId");
    const data = c.req.valid("json");

    const match = await matchService.confirmMatch(id, data, appUserId);

    return c.json(match);
  }
);

// POST /matches/:id/contest - Contest match result
matches.post(
  "/:id/contest",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Dispute a reported result",
    auth: true,
    role: true,
    notFound: true,
    conflict: true,
    success: { description: "The match after the change", schema: matchModelSchema },
  }),
  validate("json", contestMatchSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const appUserId = c.get("appUserId");
    const data = c.req.valid("json");

    const match = await matchService.contestMatch(id, data, appUserId);

    return c.json(match);
  }
);

// POST /matches/:id/respond - Unified confirm/dispute response
matches.post(
  "/:id/respond",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Confirm or dispute a result",
    description: "Unified endpoint replacing /confirm and /contest.",
    auth: true,
    role: true,
    notFound: true,
    conflict: true,
    success: { description: "The match after the change", schema: matchModelSchema },
  }),
  validate("json", respondToMatchSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const appUserId = c.get("appUserId");
    const data = c.req.valid("json");

    const match = await matchService.respondToMatch(id, data, appUserId);

    return c.json(match);
  }
);

// GET /matches/:id/messages - Discussion thread (participants and organizers)
matches.get(
  "/:id/messages",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "List a match's messages",
    description: "Restricted to the match participants and the tournament organizers.",
    auth: true,
    role: true,
    notFound: true,
    success: { description: "The discussion thread", schema: clientMatchMessageListSchema },
  }),
  async (c) => {
    const id = c.req.param("id")!;
    const appUserId = c.get("appUserId");

    const messages = await matchMessageService.list(id, appUserId);
    return c.json(messages);
  }
);

// POST /matches/:id/messages - Post a message on the thread
matches.post(
  "/:id/messages",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Post a message on a match",
    auth: true,
    role: true,
    notFound: true,
    success: { status: 201, description: "The posted message", schema: clientMatchMessageSchema },
  }),
  validate("json", postMatchMessageSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const appUserId = c.get("appUserId");
    const { body } = c.req.valid("json");

    const message = await matchMessageService.post(id, appUserId, body);
    return c.json(message, 201);
  }
);

// POST /matches/:id/cancel - Cancel match (admin or participant)
matches.post(
  "/:id/cancel",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Cancel a match",
    auth: true,
    role: true,
    notFound: true,
    conflict: true,
    success: { description: "The cancelled match", schema: matchModelSchema },
  }),
  async (c) => {
    const id = c.req.param("id")!;
    const appUserId = c.get("appUserId");

    const match = await matchService.cancelMatch(id, appUserId);
    return c.json(match);
  }
);

// POST /matches/:id/finalize - Finalize match (admin only)
matches.post(
  "/:id/finalize",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Finalize a match",
    description: "Organizers only. Settles the result whatever the confirmation state.",
    auth: true,
    role: true,
    notFound: true,
    conflict: true,
    success: { description: "The finalized match", schema: matchModelSchema },
  }),
  validate("json", finalizeMatchSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const appUserId = c.get("appUserId");
    const data = c.req.valid("json");

    // Check if user can manage matches
    const match = await matchService.getMatchById(id);
    const canManage = await matchService.canManageMatches(
      match.tournamentId,
      appUserId
    );

    if (!canManage) {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS);
    }

    const finalizedMatch = await matchService.finalizeMatch(
      id,
      data,
      appUserId
    );

    return c.json(finalizedMatch);
  }
);

// POST /matches/validate - Validate match possibility
// Rate limited: public, and each call runs the full rule engine plus a duplicate
// search. Cheap to send, not cheap to answer.
matches.post(
  "/validate",
  rateLimit({ window: 60, max: 30 }),
  describe({
    tags: TAGS,
    summary: "Check whether a match may be created",
    description:
      "Dry run against the tournament's limits. Answers 200 with valid false plus " +
      "the reasons, rather than failing. Rate limited per client.",
    rateLimited: true,
    success: { description: "Validation outcome", schema: validateMatchResponseSchema },
  }),
  validate("json", validateMatchSchema),
  async (c) => {
    const data = c.req.valid("json");

    const validation = await matchService.validateMatch({
      tournamentId: data.tournamentId,
      round: data.round,
      sides: data.sides,
      allPlayerIds: data.allPlayerIds,
      matchId: data.matchId,
      playedAt: data.playedAt,
    });

    return c.json(validation);
  }
);

// POST /matches/auto-finalize - Auto-finalize expired matches (admin only)
matches.post(
  "/auto-finalize",
  requireAuth,
  requireSuperAdmin,
  describe({
    tags: TAGS,
    summary: "Auto-finalize matches past their confirmation deadline",
    description:
      "Contested matches are held back and reported in `disputed`. Super admins only: " +
      "the sweep runs across every tournament, and the scheduler already performs it — " +
      "this is the manual escape hatch, not a user action.",
    auth: true,
    role: true,
    success: { description: "What the run settled", schema: autoFinalizeResponseSchema },
  }),
  async (c) => {
      const result = await matchService.autoFinalizeExpiredMatches();

    return c.json({
      success: true,
      message: "Auto-finalization completed",
      ...result,
    });
  }
);

export default matches;
