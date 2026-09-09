import { validate } from "../api/validator";
import { describe, type DescribeOptions } from "../api/describe";
import { z } from "zod";
import { rankedSeasonService, startOfWeekUtc } from "../services/ranked-season.service";
import { mmrAnimationEventService } from "../services/mmr-animation-event.service";
import { rulesService } from "../services/rules.service";
import { mmrCalculationService } from "../services/mmr-calculation.service";
import { seasonRewindService } from "../services/season-rewind.service";
import { playerMmrRepository } from "../repository/player-mmr.repository";
import { rankedSeasonRepository } from "../repository/ranked-season.repository";
import { rankedCacheRepository } from "../repository/ranked-cache.repository";
import { userRepository } from "../repository/user.repository";
import {
  createRankedSeasonSchema,
  updateRankedSeasonSchema,
  createRankTierSchema,
  updateRankTierSchema,
  rankedSeasonListItemSchema,
  finishedRankedSeasonSchema,
  rankedSeasonDetailSchema,
  clientRankTierSchema,
  clientRankTierListSchema,
  rankedLeaderboardSchema,
  seasonMmrLeaderboardSchema,
  playerMmrProfileSchema,
  playerCareerSchema,
  clientMmrHistoryListSchema,
  weeklyMmrLeadersSchema,
  mmrAnimationEventResponseSchema,
  badgeAnimationResponseSchema,
  markViewedResultSchema,
  ruleFiringSurfaceSchema,
  rewindBundleSchema,
  rewindArchiveListSchema,
  rewindPromotionSchema,
  mutationResultSchema,
  mmrSnapshotRequestSchema,
  mmrSnapshotResponseSchema,
} from "@skol-arena/shared/types/index";
import { requireAuth } from "../middleware/auth";
import { createAppHono } from "../types/hono";
import { NotFoundError, BadRequestError, ErrorCode } from "../types/errors";
import type { TournamentStatus } from "@skol-arena/shared/types/index";

const ranked = createAppHono();

const TAGS = ["Ranked"];
const REWIND_TAGS = ["Season rewind"];

const seasonRoute = (options: Omit<DescribeOptions, "tags">) =>
  describe({ ...options, tags: TAGS });
const rewindRoute = (options: Omit<DescribeOptions, "tags">) =>
  describe({ ...options, tags: REWIND_TAGS });

// Tiers are addressed by level, not by id. A non-numeric segment used to slip
// through as NaN and silently match no row.
function parseTierLevel(raw: string): number {
  const level = Number(raw);
  if (!Number.isInteger(level) || level < 1) {
    throw new BadRequestError(ErrorCode.INVALID_RANK_TIER_LEVEL);
  }
  return level;
}

// POST /ranked/seasons - Create a new ranked season
ranked.post(
  "/seasons",
  requireAuth,
  seasonRoute({
    summary: "Create a ranked season",
    auth: true,
    role: true,
    success: { status: 201, description: "Season created", schema: rankedSeasonDetailSchema },
  }),
  validate("json", createRankedSeasonSchema),
  async (c) => {
    const data = c.req.valid("json");
    const appUserId = c.get("appUserId");
    const result = await rankedSeasonService.createSeason(data, appUserId);
    return c.json(result, 201);
  },
);

// GET /ranked/seasons - List ranked seasons
// Public on purpose: the session is resolved when present only to fill
// `isParticipant`, an anonymous caller gets the list with `false`.
ranked.get(
  "/seasons",
  seasonRoute({
    summary: "List ranked seasons",
    description:
      "Public. A session, when present, is used only to fill isParticipant; an " +
      "anonymous caller gets the same list with false.",
    success: { description: "Seasons matching the filters", schema: z.array(rankedSeasonListItemSchema) },
  }),
  validate(
    "query",
    z.object({ disciplineId: z.string().optional(), status: z.string().optional() })
  ),
  async (c) => {
    const { disciplineId, status } = c.req.valid("query");

    const betterAuthUser = c.get("user");
    const appUser = betterAuthUser
      ? await userRepository.getByExternalId(betterAuthUser.id)
      : null;

    const seasons = await rankedSeasonService.listSeasons({
      disciplineId,
      status: status as TournamentStatus | undefined,
      ...(appUser && { viewerId: appUser.id }),
    });
    return c.json(seasons);
  }
);

// GET /ranked/seasons/finished - List finished seasons (for tier source dropdown)
ranked.get(
  "/seasons/finished",
  seasonRoute({
    summary: "List finished ranked seasons",
    description: "Trimmed rows, meant to populate the \"copy tiers from\" dropdown.",
    success: { description: "Finished seasons", schema: z.array(finishedRankedSeasonSchema) },
  }),
  async (c) => {
    const seasons = await rankedSeasonRepository.getFinishedSeasons();
    return c.json(seasons);
  }
);

// GET /ranked/seasons/:id - Get season details
ranked.get(
  "/seasons/:id",
  seasonRoute({
    summary: "Get a ranked season",
    notFound: true,
    success: { description: "The season with its MMR config and ladder", schema: rankedSeasonDetailSchema },
  }),
  async (c) => {
    const id = c.req.param("id")!;
    const season = await rankedSeasonService.getSeasonDetails(id);
    return c.json(season);
  }
);

// PATCH /ranked/seasons/:id - Update season config (draft only)
ranked.patch(
  "/seasons/:id",
  requireAuth,
  seasonRoute({
    summary: "Update a ranked season",
    description: "Only while the season is still a draft.",
    auth: true,
    role: true,
    notFound: true,
    conflict: true,
    success: { description: "The updated season", schema: rankedSeasonDetailSchema },
  }),
  validate("json", updateRankedSeasonSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const data = c.req.valid("json");
    const appUserId = c.get("appUserId");
    const season = await rankedSeasonService.updateSeason(id, data, appUserId);
    return c.json(season);
  },
);

// POST /ranked/seasons/:id/start - Start a ranked season
ranked.post(
  "/seasons/:id/start",
  requireAuth,
  seasonRoute({
    summary: "Start a ranked season",
    description: "Freezes the MMR config and opens the season to matches.",
    auth: true,
    role: true,
    notFound: true,
    conflict: true,
    success: { description: "The season in its new status", schema: rankedSeasonDetailSchema },
  }),
  async (c) => {
    const id = c.req.param("id")!;
    const appUserId = c.get("appUserId");
    const season = await rankedSeasonService.startSeason(id, appUserId);
    return c.json(season);
  }
);

// POST /ranked/seasons/:id/end - End a ranked season
ranked.post(
  "/seasons/:id/end",
  requireAuth,
  seasonRoute({
    summary: "End a ranked season",
    description: "Closes the season and queues the rewind generation.",
    auth: true,
    role: true,
    notFound: true,
    conflict: true,
    success: { description: "The season in its new status", schema: rankedSeasonDetailSchema },
  }),
  async (c) => {
    const id = c.req.param("id")!;
    const appUserId = c.get("appUserId");
    const season = await rankedSeasonService.endSeason(id, appUserId);
    return c.json(season);
  }
);

// GET /ranked/seasons/:id/tiers - List rank tiers
ranked.get(
  "/seasons/:id/tiers",
  seasonRoute({
    summary: "List a season's rank tiers",
    notFound: true,
    success: { description: "The ladder, ordered by level", schema: clientRankTierListSchema },
  }),
  async (c) => {
    const id = c.req.param("id")!;
    const tiers = await rankedSeasonRepository.getRankTiers(id);
    return c.json(tiers);
  }
);

// POST /ranked/seasons/:id/tiers - Create a rank tier
// Returns the whole ladder: the requested level may have been clamped or may
// have pushed the tiers above it one level up.
ranked.post(
  "/seasons/:id/tiers",
  requireAuth,
  seasonRoute({
    summary: "Create a rank tier",
    description:
      "Returns the whole ladder: the requested level may have been clamped, or may " +
      "have pushed the tiers above it one level up.",
    auth: true,
    role: true,
    notFound: true,
    success: { status: 201, description: "The ladder after insertion", schema: clientRankTierListSchema },
  }),
  validate("json", createRankTierSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const data = c.req.valid("json");
    const tiers = await rankedSeasonService.createTier(id, data, c.get("appUserId"));
    return c.json(tiers, 201);
  },
);

// PATCH /ranked/seasons/:id/tiers/:level - Update a rank tier
ranked.patch(
  "/seasons/:id/tiers/:level",
  requireAuth,
  seasonRoute({
    summary: "Update a rank tier",
    description: "Tiers are addressed by level, not by id.",
    auth: true,
    role: true,
    notFound: true,
    success: { description: "The updated tier", schema: clientRankTierSchema },
  }),
  validate("json", updateRankTierSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const level = parseTierLevel(c.req.param("level")!);
    const data = c.req.valid("json");
    const tier = await rankedSeasonService.updateTier(id, level, data, c.get("appUserId"));
    return c.json(tier);
  },
);

// DELETE /ranked/seasons/:id/tiers/:level - Delete a rank tier
// Returns the renumbered ladder: deleting a tier closes the gap it leaves.
ranked.delete(
  "/seasons/:id/tiers/:level",
  requireAuth,
  seasonRoute({
    summary: "Delete a rank tier",
    description: "Returns the renumbered ladder: deleting a tier closes the gap it leaves.",
    auth: true,
    role: true,
    notFound: true,
    success: { description: "The ladder after deletion", schema: clientRankTierListSchema },
  }),
  async (c) => {
    const id = c.req.param("id")!;
    const level = parseTierLevel(c.req.param("level")!);
    const tiers = await rankedSeasonService.deleteTier(id, level, c.get("appUserId"));
    return c.json(tiers);
  }
);

// POST /ranked/seasons/:id/tiers/recalculate - Recalculate tier MMR boundaries
ranked.post(
  "/seasons/:id/tiers/recalculate",
  requireAuth,
  seasonRoute({
    summary: "Recalculate tier MMR boundaries",
    description: "Re-derives each tier's minMmr from the season's current distribution.",
    auth: true,
    role: true,
    notFound: true,
    success: { description: "The recalculated ladder", schema: clientRankTierListSchema },
  }),
  async (c) => {
    const id = c.req.param("id")!;
    const tiers = await rankedSeasonService.recalculateTiers(id, c.get("appUserId"));
    return c.json(tiers);
  }
);

// GET /ranked/seasons/:id/leaderboard - Get season leaderboard (cached)
ranked.get(
  "/seasons/:id/leaderboard",
  seasonRoute({
    summary: "Get the season leaderboard",
    description: "Served from cache; recomputed on a miss. placementMatches ships alongside so the client can list unplaced players apart without a second round trip.",
    notFound: true,
    success: { description: "Ranked players plus the placement threshold", schema: rankedLeaderboardSchema },
  }),
  async (c) => {
    const id = c.req.param("id")!;
    const season = await rankedSeasonRepository.getSeasonWithConfig(id);
    if (!season) {
      throw new NotFoundError(ErrorCode.SEASON_NOT_FOUND);
    }
    const placementMatches = season.rankedConfig?.placementMatches ?? 0;
    const cached = await rankedCacheRepository.getOfficial(id);
    if (cached) return c.json({ players: cached.players, placementMatches });
    await rankedSeasonService.computeAndCacheOfficial(id);
    const fresh = await rankedCacheRepository.getOfficial(id);
    return c.json({ players: fresh?.players ?? [], placementMatches });
  }
);

// GET /ranked/seasons/:id/leaderboard/provisional - Provisional leaderboard (cached)
ranked.get(
  "/seasons/:id/leaderboard/provisional",
  seasonRoute({
    summary: "Get the provisional leaderboard",
    description: "Includes matches that are reported but not yet finalized.",
    notFound: true,
    success: { description: "Ranked players plus the placement threshold", schema: rankedLeaderboardSchema },
  }),
  async (c) => {
    const id = c.req.param("id")!;
    const season = await rankedSeasonRepository.getSeasonWithConfig(id);
    if (!season) {
      throw new NotFoundError(ErrorCode.SEASON_NOT_FOUND);
    }
    const placementMatches = season.rankedConfig?.placementMatches ?? 0;
    const cached = await rankedCacheRepository.getProvisional(id);
    if (cached) return c.json({ players: cached.players, placementMatches });
    await rankedSeasonService.computeAndCacheProvisional(id);
    const fresh = await rankedCacheRepository.getProvisional(id);
    return c.json({ players: fresh?.players ?? [], placementMatches });
  }
);

// GET /ranked/seasons/:id/leaderboard/season-stats - Peak + average MMR over the whole
// season (finished seasons only). Both metrics ship in one payload: same query cost,
// and the client switches between them without a second round trip.
ranked.get(
  "/seasons/:id/leaderboard/season-stats",
  seasonRoute({
    summary: "Get peak and average MMR over the season",
    description:
      "Finished seasons only. Both metrics ship in one payload: same query cost, and " +
      "the client switches between them without a second round trip.",
    notFound: true,
    success: { description: "Season-long MMR aggregates per player", schema: seasonMmrLeaderboardSchema },
  }),
  async (c) => {
    const id = c.req.param("id")!;
    const players = await rankedSeasonService.getSeasonMmrLeaderboard(id);
    return c.json({ players });
  }
);

// POST /ranked/seasons/:id/mmr-snapshot - MMR of a set of players at a past date
//
// A read, but a POST: the player list is a body rather than a query string, the
// same call shape `POST /matches/validate` already uses for its own read.
ranked.post(
  "/seasons/:id/mmr-snapshot",
  requireAuth,
  seasonRoute({
    summary: "Get players' MMR as of a given date",
    description:
      "Backs the match wizard's balance preview. A match can be entered days late, so the " +
      "line-up is priced with the MMR the players held when they played, not today's.",
    auth: true,
    notFound: true,
    success: { description: "One standing per requested player", schema: mmrSnapshotResponseSchema },
  }),
  validate("json", mmrSnapshotRequestSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const { playerIds, at } = c.req.valid("json");
    const players = await mmrCalculationService.getMmrSnapshotAt(id, playerIds, new Date(at));
    return c.json({ players });
  }
);

// GET /ranked/seasons/:id/players/:playerId - Player MMR profile
ranked.get(
  "/seasons/:id/players/:playerId",
  seasonRoute({
    summary: "Get a player's MMR profile",
    description: "Everything the profile page needs — rating, ladder, opponent quality and chart — in one call.",
    notFound: true,
    success: { description: "The player's MMR profile", schema: playerMmrProfileSchema },
  }),
  async (c) => {
    const { id, playerId } = c.req.param();
    const [mmr, tiers, opponentQuality, chartHistory, config] = await Promise.all([
      playerMmrRepository.getBySeasonAndPlayer(id, playerId),
      rankedSeasonRepository.getRankTiers(id),
      playerMmrRepository.getOpponentQualityStats(id, playerId),
      playerMmrRepository.getMmrChartSeries(id, playerId),
      rankedSeasonRepository.getConfigByTournamentId(id),
    ]);
    if (!mmr) {
      throw new NotFoundError(ErrorCode.NOT_FOUND);
    }
    return c.json({
      mmr,
      tiers,
      opponentQuality,
      chartHistory,
      placementMatches: config?.placementMatches ?? 0,
    });
  }
);

// GET /ranked/seasons/:id/players/:playerId/history - MMR history
ranked.get(
  "/seasons/:id/players/:playerId/history",
  seasonRoute({
    summary: "Get a player's MMR history",
    description: "One entry per rated match, most recent first, with the line-ups.",
    notFound: true,
    success: { description: "A page of MMR history entries", schema: clientMmrHistoryListSchema },
  }),
  validate(
    "query",
    z.object({
      limit: z.coerce.number().int().min(1).max(100).default(10),
      offset: z.coerce.number().int().min(0).default(0),
    })
  ),
  async (c) => {
    const { id, playerId } = c.req.param();
    const { limit, offset } = c.req.valid("query");

    const history = await playerMmrRepository.getMmrHistory(id, playerId, limit, offset);
    const matchIds = history.map((h) => h.matchId);
    const sidesData = await playerMmrRepository.getMatchPlayersForHistory(matchIds);

    const sidesMap = new Map<string, { position: number; players: { id: string; displayName: string; shortName: string }[] }[]>();
    for (const side of sidesData) {
      const list = sidesMap.get(side.matchId) ?? [];
      list.push({
        position: side.position,
        players: (side.entry?.players ?? []).map((p) => ({
          id: p.player.id,
          displayName: p.player.displayName,
          shortName: p.player.shortName ?? p.player.displayName,
        })),
      });
      sidesMap.set(side.matchId, list);
    }

    const enriched = history.map((h) => ({ ...h, sides: sidesMap.get(h.matchId) ?? [] }));
    return c.json(enriched);
  }
);

// GET /ranked/players/:playerId/career - Peak and average MMR, season by season
ranked.get(
  "/players/:playerId/career",
  seasonRoute({
    summary: "Get a player's ranked career",
    description:
      "One row per season the player has a rated match in, newest first, with the " +
      "peak and average MMR of that run and the ladder in force at the time. The " +
      "running season is included: unlike the season leaderboard, the record in " +
      "progress counts. Seasons under the placement threshold are flagged, not hidden.",
    success: { description: "The player's seasons, newest first", schema: playerCareerSchema },
  }),
  async (c) => {
    const playerId = c.req.param("playerId")!;
    const seasons = await rankedSeasonService.getPlayerCareer(playerId);
    return c.json({ seasons });
  }
);

// GET /ranked/seasons/:id/weekly-mmr - Best MMR climbers / drops of the week
ranked.get(
  "/seasons/:id/weekly-mmr",
  seasonRoute({
    summary: "Get the week's best MMR climbers and drops",
    description:
      "Clients send their own local Monday in `from` so the player tile and this " +
      "ranking share the exact same boundary; the UTC week is only a fallback.",
    notFound: true,
    success: { description: "Gainers and losers over the week", schema: weeklyMmrLeadersSchema },
  }),
  validate("query", z.object({ from: z.string().datetime().optional() })),
  async (c) => {
    const id = c.req.param("id")!;
    const season = await rankedSeasonRepository.getSeasonWithConfig(id);
    if (!season) {
      throw new NotFoundError(ErrorCode.SEASON_NOT_FOUND);
    }
    // Clients send their own local Monday so the player tile and this ranking
    // share the exact same boundary; the UTC week is only a fallback.
    const { from } = c.req.valid("query");
    const weekStart = from ? new Date(from) : startOfWeekUtc(new Date());
    const leaders = await rankedSeasonService.getWeeklyMmrLeaders(id, weekStart);
    return c.json(leaders);
  },
);

// GET /ranked/seasons/:id/animation-events/pending - Get pending MMR animation events
ranked.get(
  "/seasons/:id/animation-events/pending",
  requireAuth,
  seasonRoute({
    summary: "List pending MMR animations",
    description: "Events the signed-in player has not yet been shown, in this season.",
    auth: true,
    success: {
      description: "Pending MMR animation events",
      schema: z.object({ events: z.array(mmrAnimationEventResponseSchema) }),
    },
  }),
  async (c) => {
    const seasonId = c.req.param("id")!;
    const playerId = c.get("appUserId");
    const events = await mmrAnimationEventService.getPendingForPlayer(playerId, seasonId, c.get("lang"));
    return c.json({ events });
  }
);

// POST /ranked/seasons/:id/animation-events/mark-viewed - Mark events as viewed
ranked.post(
  "/seasons/:id/animation-events/mark-viewed",
  requireAuth,
  seasonRoute({
    summary: "Mark MMR animations as viewed",
    auth: true,
    success: { description: "How many events were marked", schema: markViewedResultSchema },
  }),
  validate(
    "json",
    z.object({
      ids: z.array(z.string().uuid()),
      // Which screen consumed them. Optional: an older client sends none, and the
      // rules-engine stats then record the firing as delivered but of unknown fate
      // rather than assuming it was read.
      surface: ruleFiringSurfaceSchema.optional(),
    }),
  ),
  async (c) => {
    const { ids, surface } = c.req.valid("json");
    await mmrAnimationEventService.markViewed(ids, surface);
    return c.json({ success: true, markedCount: ids.length });
  },
);

// GET /ranked/seasons/:id/badge-animations/pending - Pending badge reveal animations
ranked.get(
  "/seasons/:id/badge-animations/pending",
  requireAuth,
  seasonRoute({
    summary: "List pending badge reveals",
    auth: true,
    success: {
      description: "Badge animations not yet shown to the player",
      schema: z.object({ badges: z.array(badgeAnimationResponseSchema) }),
    },
  }),
  async (c) => {
    const seasonId = c.req.param("id")!;
    const playerId = c.get("appUserId");
    const badges = await rulesService.getPendingBadges(playerId, seasonId);
    return c.json({ badges });
  }
);

// POST /ranked/seasons/:id/badge-animations/mark-viewed - Mark badge animations as viewed
ranked.post(
  "/seasons/:id/badge-animations/mark-viewed",
  requireAuth,
  seasonRoute({
    summary: "Mark badge reveals as viewed",
    auth: true,
    success: { description: "How many badges were marked", schema: markViewedResultSchema },
  }),
  validate("json", z.object({ ids: z.array(z.string().uuid()) })),
  async (c) => {
    const { ids } = c.req.valid("json");
    const playerId = c.get("appUserId");
    await rulesService.markBadgesViewed(ids, playerId);
    return c.json({ success: true, markedCount: ids.length });
  },
);

// ============================================
// Season Rewind
// ============================================

// GET /ranked/rewinds/promoted - The rewind worth showing the player right now.
// Declared before /rewinds so the static segment is not eaten by a later route.
ranked.get(
  "/rewinds/promoted",
  requireAuth,
  rewindRoute({
    summary: "Get the rewind worth showing right now",
    description:
      "Generated less than the promotion window ago and not watched through to the " +
      "end. The server owns this decision entirely; null when there is nothing to promote.",
    auth: true,
    success: { description: "The promoted rewind, or null", schema: rewindPromotionSchema.nullable() },
  }),
  async (c) => {
    const playerId = c.get("appUserId");
    const promotion = await seasonRewindService.getPromoted(playerId);
    return c.json(promotion);
  }
);

// GET /ranked/rewinds - Every rewind the player owns, no promotion window applied
ranked.get(
  "/rewinds",
  requireAuth,
  rewindRoute({
    summary: "List the player's rewinds",
    description: "Every rewind the player owns, with no promotion window applied.",
    auth: true,
    success: { description: "The rewind archive", schema: rewindArchiveListSchema },
  }),
  async (c) => {
    const playerId = c.get("appUserId");
    const rewinds = await seasonRewindService.listArchive(playerId);
    return c.json(rewinds);
  }
);

// GET /ranked/seasons/:id/rewind - Global season recap (public, like the leaderboard)
ranked.get(
  "/seasons/:id/rewind",
  rewindRoute({
    summary: "Get a season's recap",
    description: "Public, like the leaderboard. `player` is null here; see /rewind/me.",
    notFound: true,
    success: { description: "The season recap", schema: rewindBundleSchema },
  }),
  async (c) => {
    const seasonId = c.req.param("id")!;
    const bundle = await seasonRewindService.getBundle(seasonId, null);
    return c.json(bundle);
  }
);

// GET /ranked/seasons/:id/rewind/me - Global recap + the caller's own deck, in one call
ranked.get(
  "/seasons/:id/rewind/me",
  requireAuth,
  rewindRoute({
    summary: "Get a season's recap with the caller's own deck",
    description: "The global recap and the personal deck in one call.",
    auth: true,
    notFound: true,
    success: { description: "The season recap plus the player's deck", schema: rewindBundleSchema },
  }),
  async (c) => {
    const seasonId = c.req.param("id")!;
    const bundle = await seasonRewindService.getBundle(seasonId, c.get("appUserId"));
    return c.json(bundle);
  }
);

// POST /ranked/seasons/:id/rewind/opened - First open; stops the season page auto-opening it
ranked.post(
  "/seasons/:id/rewind/opened",
  requireAuth,
  rewindRoute({
    summary: "Mark a rewind as opened",
    description: "First open; stops the season page auto-opening it.",
    auth: true,
    notFound: true,
    success: { description: "State recorded", schema: mutationResultSchema },
  }),
  async (c) => {
    const seasonId = c.req.param("id")!;
    await seasonRewindService.markOpened(seasonId, c.get("appUserId"));
    return c.json({ success: true });
  }
);

// POST /ranked/seasons/:id/rewind/viewed - Deck watched to the end; retires the promo card
ranked.post(
  "/seasons/:id/rewind/viewed",
  requireAuth,
  rewindRoute({
    summary: "Mark a rewind as watched",
    description: "Deck watched to the end; retires the promo card.",
    auth: true,
    notFound: true,
    success: { description: "State recorded", schema: mutationResultSchema },
  }),
  async (c) => {
    const seasonId = c.req.param("id")!;
    await seasonRewindService.markViewed(seasonId, c.get("appUserId"));
    return c.json({ success: true });
  }
);

// POST /ranked/seasons/:id/rewind/regenerate - Admin rebuild (keeps per-player state)
ranked.post(
  "/seasons/:id/rewind/regenerate",
  requireAuth,
  rewindRoute({
    summary: "Regenerate a season's rewind",
    description: "Admin rebuild. Per-player state (opened, viewed) is preserved.",
    auth: true,
    role: true,
    notFound: true,
    conflict: true,
    success: { description: "Regeneration outcome", schema: mutationResultSchema },
  }),
  async (c) => {
    const seasonId = c.req.param("id")!;
    await rankedSeasonService.regenerateRewind(seasonId, c.get("appUserId"));
    return c.json({ success: true });
  }
);

export default ranked;
