import { z } from "zod";
import { requireAuth, resolveOptionalViewer } from "../middleware/auth";
import { userService } from "../services/user.service";
import { createAppHono } from "../types/hono";
import { userRepository } from "../repository/user.repository";
import { ForbiddenError, ErrorCode } from "../types/errors";
import { validate } from "../api/validator";
import { describe } from "../api/describe";
import {
  updateProfileSchema,
  playerStatsFiltersSchema,
  userSearchSchema,
  playerComparisonSchema,
  appUserSchema,
  appUserWithAuthSchema,
  playerProfileSchema,
  playerStatsResponseSchema,
  playerComparisonResponseSchema,
  playerTournamentOptionSchema,
  playerBadgeSchema,
} from "@skol-arena/shared";
import { playerStatsService } from "../services/player-stats.service";
import { rulesService } from "../services/rules.service";

const users = createAppHono();

const TAGS = ["Users"];

// GET /users/me - Get current user details
users.get(
  "/me",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Get the current user",
    auth: true,
    success: {
      description: "The signed-in user's app profile and Better Auth record",
      schema: appUserWithAuthSchema,
    },
  }),
  async (c) => {
    const appUserId = c.get("appUserId");
    const betterAuthUser = c.get("user");

    // Get app user details
    const appUser = await userService.getAppUserById(appUserId);

    return c.json({
      id: appUser.id,
      externalId: appUser.externalId,
      displayName: appUser.displayName,
      shortName: appUser.shortName,
      role: appUser.role,
      avatarVersion: appUser.avatarVersion ?? null,
      createdAt: appUser.createdAt,
      updatedAt: appUser.updatedAt,
      // Include Better Auth user info as well
      betterAuth: {
        id: betterAuthUser?.id,
        email: betterAuthUser?.email,
        name: betterAuthUser?.name,
        image: betterAuthUser?.image,
        emailVerified: betterAuthUser?.emailVerified,
        createdAt: betterAuthUser?.createdAt,
        updatedAt: betterAuthUser?.updatedAt,
      },
    });
  }
);

// PATCH /users/me - Update current user profile
users.patch(
  "/me",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Update the current user's profile",
    auth: true,
    conflict: true,
    success: { description: "The updated profile", schema: appUserSchema },
  }),
  validate("json", updateProfileSchema),
  async (c) => {
    const appUserId = c.get("appUserId");
    const data = c.req.valid("json");
    const updated = await userService.updateProfile(appUserId, data);
    return c.json({
      id: updated.id,
      externalId: updated.externalId,
      displayName: updated.displayName,
      shortName: updated.shortName,
      role: updated.role,
      avatarVersion: updated.avatarVersion ?? null,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  }
);

// GET /users - Get all users (admin only)
users.get(
  "/",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "List all users",
    description:
      "Restricted to super admins and tournament admins. Email and account name are only returned to super admins.",
    auth: true,
    role: true,
    success: { description: "Every user", schema: z.array(appUserWithAuthSchema) },
  }),
  async (c) => {
    const appUserId = c.get("appUserId");

    const currentUser = await userRepository.getById(appUserId);
    if (
      !currentUser ||
      (currentUser.role !== "super_admin" &&
        currentUser.role !== "tournament_admin")
    ) {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS);
    }

    const allUsers = await userService.getAllUsers();
    // Tournament admins pick players from this list; they get names, not contact
    // details. The Better Auth name is often the email, so it goes with it.
    const canSeeContact = currentUser.role === "super_admin";

    const usersResponse = allUsers.map((user) => ({
      id: user.id,
      externalId: user.externalId,
      displayName: user.displayName,
      shortName: user.shortName,
      role: user.role,
      avatarVersion: user.avatarVersion ?? null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      betterAuth: {
        id: user.externalUser?.id,
        email: canSeeContact ? user.externalUser?.email : undefined,
        name: canSeeContact ? user.externalUser?.name : undefined,
        image: user.externalUser?.image,
        emailVerified: user.externalUser?.emailVerified,
        createdAt: user.externalUser?.createdAt,
        updatedAt: user.externalUser?.updatedAt,
      },
    }));

    return c.json(usersResponse);
  }
);

// GET /users/search - Search players by name (authenticated)
// Registered before /:id so it is not captured as a player id
users.get(
  "/search",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Search players by name",
    auth: true,
    success: { description: "Matching players", schema: z.array(playerProfileSchema) },
  }),
  validate("query", userSearchSchema),
  async (c) => {
    const { q, limit } = c.req.valid("query");
    const players = await userService.searchUsers(q, limit);
    return c.json(players);
  }
);

// GET /users/compare - Compare two players (authenticated)
// Registered before /:id so it is not captured as a player id
users.get(
  "/compare",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Compare two players",
    auth: true,
    notFound: true,
    success: {
      description: "Both players' stats plus their head-to-head and team-up records",
      schema: playerComparisonResponseSchema,
    },
  }),
  validate("query", playerComparisonSchema),
  async (c) => {
    const { playerA, playerB, ...filters } = c.req.valid("query");
    const result = await playerStatsService.getComparison(playerA, playerB, filters, c.get("appUserId"));
    return c.json(result);
  }
);

// GET /users/:id - Public player profile
users.get(
  "/:id",
  describe({
    tags: TAGS,
    summary: "Get a player's public profile",
    notFound: true,
    success: { description: "The player", schema: playerProfileSchema },
  }),
  async (c) => {
    const id = c.req.param("id");
    const player = await playerStatsService.getPlayerProfile(id);
    return c.json(player);
  }
);

// GET /users/:id/tournaments - Tournaments list for filter dropdown
users.get(
  "/:id/tournaments",
  describe({
    tags: TAGS,
    summary: "List the tournaments a player took part in",
    description: "Intended to populate the filter dropdown on a player's stats page.",
    notFound: true,
    success: {
      description: "Tournaments the player entered",
      schema: z.object({ tournaments: z.array(playerTournamentOptionSchema) }),
    },
  }),
  async (c) => {
    const id = c.req.param("id");
    const tournaments = await playerStatsService.getPlayerTournaments(id, await resolveOptionalViewer(c));
    return c.json({ tournaments });
  }
);

// GET /users/:id/stats - Player stats (filterable)
users.get(
  "/:id/stats",
  describe({
    tags: TAGS,
    summary: "Get a player's statistics",
    notFound: true,
    success: {
      description: "Statistics for the player, narrowed by the query filters",
      schema: playerStatsResponseSchema,
    },
  }),
  validate("query", playerStatsFiltersSchema),
  async (c) => {
    const id = c.req.param("id");
    const filters = c.req.valid("query");
    const result = await playerStatsService.getPlayerStats(id, filters, await resolveOptionalViewer(c));
    return c.json(result);
  }
);

// GET /users/:id/badges - Player badges (public)
users.get(
  "/:id/badges",
  describe({
    tags: TAGS,
    summary: "List a player's badges",
    success: {
      description: "Badges the player has earned",
      schema: z.object({ badges: z.array(playerBadgeSchema) }),
    },
  }),
  async (c) => {
    const id = c.req.param("id");
    const badges = await rulesService.getPlayerBadges(id, await resolveOptionalViewer(c));
    return c.json({ badges });
  }
);

export default users;
