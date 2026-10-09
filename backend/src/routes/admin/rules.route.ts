import { z } from "zod";
import { validate } from "../../api/validator";
import { describe, type DescribeOptions } from "../../api/describe";
import { createAppHono } from "../../types/hono";
import { requireAuth } from "../../middleware/auth";
import { requireSuperAdmin } from "../../middleware/require-role";
import { rulesService } from "../../services/rules.service";
import {
  createRuleSchema,
  testRuleSchema,
  updateRuleSchema,
  ruleSchema,
  ruleListSchema,
  testRuleResultSchema,
  factCatalogSchema,
  badgeReconciliationStateSchema,
  ruleFiringStatsListSchema,
  ruleFiringDetailSchema,
  ruleFiringOverviewSchema,
  ruleFiringFeedSchema,
  ruleFiringFeedQuerySchema,
} from "@skol-arena/shared";
import type { RuleScope, RuleType } from "@skol-arena/shared";

const adminRules = createAppHono();

const TAGS = ["Admin — rules"];

const listFiltersSchema = z.object({
  type: z.enum(["message", "badge"]).optional(),
  triggerEvent: z.string().optional(),
  scope: z.enum(["global", "discipline"]).optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

adminRules.use("*", requireAuth, requireSuperAdmin);

/** Every route in this file sits behind requireAuth + requireSuperAdmin. */
const adminRoute = (options: Omit<DescribeOptions, "tags" | "auth" | "role">) =>
  describe({ ...options, tags: TAGS, auth: true, role: true });

adminRules.get(
  "/catalog",
  adminRoute({
    summary: "List the facts a rule can test",
    description: "Drives the condition builder in the rule editor.",
    success: { description: "Facts available for the trigger event", schema: factCatalogSchema },
  }),
  validate("query", z.object({ triggerEvent: z.string().optional() })),
  (c) => {
    const { triggerEvent } = c.req.valid("query");
    return c.json(rulesService.getCatalog(triggerEvent ?? "match_submitted"));
  }
);

adminRules.post(
  "/test",
  adminRoute({
    summary: "Simulate a rule",
    description: "Runs the conditions against a supplied context without saving anything.",
    success: { description: "Whether the rule matched, and what it would emit", schema: testRuleResultSchema },
  }),
  validate("json", testRuleSchema),
  async (c) => {
    const { conditions, action, context } = c.req.valid("json");
    const result = await rulesService.test(conditions, action, context);
    return c.json(result);
  }
);

adminRules.get(
  "/",
  adminRoute({
    summary: "List rules",
    success: { description: "Rules matching the filters", schema: ruleListSchema },
  }),
  validate("query", listFiltersSchema),
  async (c) => {
    const filters = c.req.valid("query");
    const rules = await rulesService.list({
      type: filters.type as RuleType | undefined,
      triggerEvent: filters.triggerEvent,
      scope: filters.scope as RuleScope | undefined,
      isActive: filters.isActive,
    });
    return c.json(rules);
  }
);

adminRules.post(
  "/",
  adminRoute({
    summary: "Create a rule",
    success: { status: 201, description: "Rule created", schema: ruleSchema },
  }),
  validate("json", createRuleSchema),
  async (c) => {
    const data = c.req.valid("json");
    const appUserId = c.get("appUserId");
    const rule = await rulesService.create(data, appUserId);
    return c.json(rule, 201);
  }
);

adminRules.get(
  "/reconcile-badges/status",
  adminRoute({
    summary: "Get badge reconciliation status",
    description: "`dirty` means a badge rule changed since the last run.",
    success: { description: "Current reconciliation state", schema: badgeReconciliationStateSchema },
  }),
  async (c) => {
    const state = await rulesService.getReconciliationState();
    return c.json(state);
  }
);

adminRules.post(
  "/reconcile-badges",
  adminRoute({
    summary: "Queue a badge reconciliation",
    description: "Returns as soon as the job is queued; the run itself is asynchronous.",
    success: { status: 202, description: "Reconciliation queued", schema: z.object({ queued: z.boolean() }) },
  }),
  async (c) => {
    await rulesService.triggerReconciliation();
    return c.json({ queued: true }, 202);
  }
);

// Declared before "/:id" so the literal segment is not swallowed by the parameter.
adminRules.get(
  "/stats",
  adminRoute({
    summary: "Firing counters for every rule",
    description:
      "How often each rule evaluated true, and what became of the message: delivered, read, " +
      "or drowned in a grouped MMR recap. Rules that never fired are returned at zero.",
    success: { description: "One row per rule", schema: ruleFiringStatsListSchema },
  }),
  async (c) => {
    const rules = await rulesService.listFiringStats();
    return c.json({ rules });
  }
);

const windowQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

adminRules.get(
  "/overview",
  adminRoute({
    summary: "Firing overview across every rule",
    description:
      "All-time and windowed totals, a daily timeline split by rule type, and one row " +
      "per rule — the global counterpart of `/:id/stats`.",
    success: { description: "Global firing statistics", schema: ruleFiringOverviewSchema },
  }),
  validate("query", windowQuerySchema),
  async (c) => {
    const { days } = c.req.valid("query");
    return c.json(await rulesService.getFiringOverview(days));
  }
);

adminRules.get(
  "/feed",
  adminRoute({
    summary: "Latest rule firings",
    description:
      "Every rule's firings, newest first, walked with a keyset `cursor` rather than an " +
      "offset: firings keep arriving while the feed is read.",
    success: { description: "A page of firings", schema: ruleFiringFeedSchema },
  }),
  validate("query", ruleFiringFeedQuerySchema),
  async (c) => {
    return c.json(await rulesService.getFiringFeed(c.req.valid("query")));
  }
);

adminRules.get(
  "/:id/stats",
  adminRoute({
    summary: "Firing detail for one rule",
    description: "Totals, per-variant breakdown, daily timeline and the most recent recipients.",
    notFound: true,
    success: { description: "The rule's firing statistics", schema: ruleFiringDetailSchema },
  }),
  validate("query", windowQuerySchema),
  async (c) => {
    const { days } = c.req.valid("query");
    const detail = await rulesService.getFiringDetail(c.req.param("id")!, days);
    return c.json(detail);
  }
);

adminRules.get(
  "/:id/badge-count",
  adminRoute({
    summary: "Count the badges a rule has awarded",
    notFound: true,
    success: {
      description: "Number of badges awarded by this rule",
      schema: z.object({ count: z.number().int() }),
    },
  }),
  async (c) => {
    const count = await rulesService.getBadgeCount(c.req.param("id")!);
    return c.json({ count });
  }
);

adminRules.get(
  "/:id",
  adminRoute({
    summary: "Get a rule",
    notFound: true,
    success: { description: "The rule", schema: ruleSchema },
  }),
  async (c) => {
    const rule = await rulesService.getById(c.req.param("id")!);
    return c.json(rule);
  }
);

adminRules.patch(
  "/:id",
  adminRoute({
    summary: "Update a rule",
    notFound: true,
    success: { description: "The updated rule", schema: ruleSchema },
  }),
  validate("json", updateRuleSchema),
  async (c) => {
    const rule = await rulesService.update(c.req.param("id")!, c.req.valid("json"));
    return c.json(rule);
  }
);

adminRules.delete(
  "/:id",
  adminRoute({
    summary: "Delete a rule",
    notFound: true,
    success: { status: 204, description: "Rule deleted" },
  }),
  async (c) => {
    await rulesService.delete(c.req.param("id")!);
    return c.body(null, 204);
  }
);

export default adminRules;
