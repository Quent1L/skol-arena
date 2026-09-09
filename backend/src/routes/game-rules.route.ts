import { validate } from "../api/validator";
import { describe } from "../api/describe";
import { gameRulesService } from "../services/game-rules.service";
import {
  createGameRuleSchema,
  updateGameRuleSchema,
  gameRuleSchema,
  gameRuleListSchema,
  mutationResultSchema,
} from "@skol-arena/shared/types/index";
import { requireAuth } from "../middleware/auth";
import { createAppHono } from "../types/hono";

const gameRules = createAppHono();

const TAGS = ["Game rules"];

// GET /game-rules - List all game rules (auth required)
gameRules.get(
  "/",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "List game rules",
    auth: true,
    success: { description: "Every game rule", schema: gameRuleListSchema },
  }),
  async (c) => {
    const rules = await gameRulesService.listGameRules();
    return c.json(rules);
  }
);

// POST /game-rules - Create a new game rule
gameRules.post(
  "/",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Create a game rule",
    description: "Restricted to super admins and tournament admins.",
    auth: true,
    role: true,
    success: { status: 201, description: "Game rule created", schema: gameRuleSchema },
  }),
  validate("json", createGameRuleSchema),
  async (c) => {
    const data = c.req.valid("json");
    const appUserId = c.get("appUserId");
    const rule = await gameRulesService.createGameRule({
      ...data,
      createdBy: appUserId,
    });
    return c.json(rule, 201);
  }
);

// GET /game-rules/:id - Get single game rule (public)
//
// Public on purpose, and deliberately out of step with GET / above: a rule is meant
// to be shared by link with someone who has no account. Enumerating every rule stays
// behind a session; handing out one of them does not.
gameRules.get(
  "/:id",
  describe({
    tags: TAGS,
    summary: "Get a game rule",
    description:
      "Public, so a rule can be shared by link with a reader who has no account. " +
      "Listing them all requires a session; reading one does not.",
    notFound: true,
    success: { description: "The game rule", schema: gameRuleSchema },
  }),
  async (c) => {
    const id = c.req.param("id")!;
    const rule = await gameRulesService.getGameRuleById(id);
    return c.json(rule);
  }
);

// PATCH /game-rules/:id - Update game rule
gameRules.patch(
  "/:id",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Update a game rule",
    auth: true,
    role: true,
    notFound: true,
    success: { description: "The updated game rule", schema: gameRuleSchema },
  }),
  validate("json", updateGameRuleSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const data = c.req.valid("json");
    const appUserId = c.get("appUserId");
    const rule = await gameRulesService.updateGameRule(id, appUserId, data);
    return c.json(rule);
  }
);

// DELETE /game-rules/:id - Delete game rule
gameRules.delete(
  "/:id",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Delete a game rule",
    auth: true,
    role: true,
    notFound: true,
    success: { description: "Deletion outcome", schema: mutationResultSchema },
  }),
  async (c) => {
    const id = c.req.param("id")!;
    const appUserId = c.get("appUserId");
    await gameRulesService.deleteGameRule(id, appUserId);
    return c.json({ success: true });
  }
);

export default gameRules;
