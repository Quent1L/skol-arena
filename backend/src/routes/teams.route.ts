import { validate } from "../api/validator";
import { describe } from "../api/describe";
import { z } from "zod";
import { teamService } from "../services/team.service";
import { tournamentService } from "../services/tournament.service";
import { requireAuth, resolveOptionalViewer } from "../middleware/auth";
import { createAppHono } from "../types/hono";
import {
  createTeamSchema,
  clientTeamSchema,
  clientTeamListSchema,
  mutationResultSchema,
} from "@skol-arena/shared/types/index";

const teams = createAppHono();

const TAGS = ["Teams"];

// GET /tournaments/:id/teams - List teams (public)
teams.get(
  "/:id/teams",
  describe({
    tags: TAGS,
    summary: "List a tournament's teams",
    description:
      "Public for an open competition; one scoped to an organization is only listed " +
      "for its members.",
    role: true,
    notFound: true,
    success: { description: "Teams in the tournament", schema: clientTeamListSchema },
  }),
  async (c) => {
    const tournamentId = c.req.param("id")!;
    await tournamentService.assertCanAccess(tournamentId, await resolveOptionalViewer(c));
    const result = await teamService.listTeams(tournamentId);
    return c.json(result);
  }
);

// POST /tournaments/:id/teams - Create a team (auth required)
teams.post(
  "/:id/teams",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Create a team",
    auth: true,
    role: true,
    notFound: true,
    conflict: true,
    success: { status: 201, description: "Team created", schema: clientTeamSchema },
  }),
  validate("json", createTeamSchema),
  async (c) => {
    const tournamentId = c.req.param("id")!;
    const { name } = c.req.valid("json");
    const appUserId = c.get("appUserId")!;
    const isAdmin = await tournamentService.canManageTournament(tournamentId, appUserId);
    const team = await teamService.createTeam(tournamentId, name, appUserId, isAdmin);
    return c.json(team, 201);
  },
);

// POST /tournaments/:id/teams/:teamId/join - Join a team (auth required)
teams.post(
  "/:id/teams/:teamId/join",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Join a team",
    description:
      "Joins as the signed-in user unless userId is given, which only an admin may do.",
    auth: true,
    role: true,
    notFound: true,
    conflict: true,
    success: { description: "The team after the join", schema: clientTeamSchema },
  }),
  validate("json", z.object({ userId: z.string().uuid().optional() })),
  async (c) => {
    const tournamentId = c.req.param("id")!;
    const teamId = c.req.param("teamId")!;
    const { userId } = c.req.valid("json");
    const appUserId = c.get("appUserId")!;
    const isAdmin = await tournamentService.canManageTournament(tournamentId, appUserId);
    const targetUserId = userId ?? appUserId;
    const team = await teamService.joinTeam(teamId, tournamentId, targetUserId, appUserId, isAdmin);
    return c.json(team);
  },
);

// DELETE /tournaments/:id/teams/:teamId/leave - Leave a team (auth required)
teams.delete(
  "/:id/teams/:teamId/leave",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Leave a team",
    description:
      "Removes the signed-in user unless the userId query parameter is given, " +
      "which only an admin may do.",
    auth: true,
    role: true,
    notFound: true,
    success: { description: "Removal outcome", schema: mutationResultSchema },
  }),
  validate("query", z.object({ userId: z.string().uuid().optional() })),
  async (c) => {
    const tournamentId = c.req.param("id")!;
    const teamId = c.req.param("teamId")!;
    const appUserId = c.get("appUserId")!;
    const { userId } = c.req.valid("query");
    const isAdmin = await tournamentService.canManageTournament(tournamentId, appUserId);
    await teamService.leaveTeam(teamId, userId ?? appUserId, appUserId, isAdmin);
    return c.json({ success: true });
  },
);

// DELETE /tournaments/:id/teams/:teamId - Delete a team (auth required, admin/creator)
teams.delete(
  "/:id/teams/:teamId",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Delete a team",
    auth: true,
    role: true,
    notFound: true,
    conflict: true,
    success: { description: "Deletion outcome", schema: mutationResultSchema },
  }),
  async (c) => {
    const tournamentId = c.req.param("id")!;
    const teamId = c.req.param("teamId")!;
    const appUserId = c.get("appUserId")!;
    const isAdmin = await tournamentService.canManageTournament(tournamentId, appUserId);
    await teamService.deleteTeam(teamId, appUserId, isAdmin);
    return c.json({ success: true });
  },
);

export default teams;
