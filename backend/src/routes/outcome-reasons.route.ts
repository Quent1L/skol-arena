import { z } from "zod";
import { validate } from "../api/validator";
import { describe } from "../api/describe";
import { outcomeReasonService } from "../services/outcome-reason.service";
import {
  createOutcomeReasonSchema,
  updateOutcomeReasonSchema,
  outcomeReasonSchema,
  outcomeReasonListSchema,
  mutationResultSchema,
} from "@skol-arena/shared/types/index";
import { requireAuth } from "../middleware/auth";
import { requireSuperAdmin } from "../middleware/require-role";
import { createAppHono } from "../types/hono";

const outcomeReasons = createAppHono();

const TAGS = ["Outcome reasons"];

// POST /outcome-reasons - Create new outcome reason
outcomeReasons.post(
  "/",
  requireAuth,
  requireSuperAdmin,
  describe({
    tags: TAGS,
    summary: "Create an outcome reason",
    auth: true,
    role: true,
    notFound: true,
    success: {
      status: 201,
      description: "Outcome reason created",
      schema: outcomeReasonSchema,
    },
  }),
  validate("json", createOutcomeReasonSchema),
  async (c) => {
    const data = c.req.valid("json");
    const outcomeReason = await outcomeReasonService.createOutcomeReason(data);
    return c.json(outcomeReason, 201);
  },
);

// GET /outcome-reasons - List all outcome reasons (with optional outcomeTypeId filter)
outcomeReasons.get(
  "/",
  describe({
    tags: TAGS,
    summary: "List outcome reasons",
    success: { description: "Matching outcome reasons", schema: outcomeReasonListSchema },
  }),
  validate("query", z.object({ outcomeTypeId: z.string().optional() })),
  async (c) => {
    const { outcomeTypeId } = c.req.valid("query");
    const outcomeReasonsList = await outcomeReasonService.listOutcomeReasons(outcomeTypeId);
    return c.json(outcomeReasonsList);
  },
);

// GET /outcome-reasons/:id - Get single outcome reason
outcomeReasons.get(
  "/:id",
  describe({
    tags: TAGS,
    summary: "Get an outcome reason",
    notFound: true,
    success: { description: "The outcome reason", schema: outcomeReasonSchema },
  }),
  async (c) => {
    const id = c.req.param("id")!;
    const outcomeReason = await outcomeReasonService.getOutcomeReasonById(id);
    return c.json(outcomeReason);
  },
);

// PATCH /outcome-reasons/:id - Update outcome reason
outcomeReasons.patch(
  "/:id",
  requireAuth,
  requireSuperAdmin,
  describe({
    tags: TAGS,
    summary: "Update an outcome reason",
    auth: true,
    role: true,
    notFound: true,
    success: { description: "The updated outcome reason", schema: outcomeReasonSchema },
  }),
  validate("json", updateOutcomeReasonSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const data = c.req.valid("json");
    const outcomeReason = await outcomeReasonService.updateOutcomeReason(id, data);
    return c.json(outcomeReason);
  },
);

// DELETE /outcome-reasons/:id - Delete outcome reason
outcomeReasons.delete(
  "/:id",
  requireAuth,
  requireSuperAdmin,
  describe({
    tags: TAGS,
    summary: "Delete an outcome reason",
    description: "Only while no match was recorded with it. Otherwise answers 409 with the match count.",
    auth: true,
    role: true,
    notFound: true,
    conflict: true,
    success: { description: "Deletion outcome", schema: mutationResultSchema },
  }),
  async (c) => {
    const id = c.req.param("id")!;
    const result = await outcomeReasonService.deleteOutcomeReason(id);
    return c.json(result);
  },
);

export default outcomeReasons;
