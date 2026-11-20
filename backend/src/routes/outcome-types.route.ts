import { z } from "zod";
import { validate } from "../api/validator";
import { describe } from "../api/describe";
import { outcomeTypeService } from "../services/outcome-type.service";
import {
  createOutcomeTypeSchema,
  updateOutcomeTypeSchema,
  outcomeTypeSchema,
  outcomeTypeListSchema,
  mutationResultSchema,
} from "@skol-arena/shared/types/index";
import { requireAuth } from "../middleware/auth";
import { requireSuperAdmin } from "../middleware/require-role";
import { createAppHono } from "../types/hono";

const outcomeTypes = createAppHono();

const TAGS = ["Outcome types"];

// POST /outcome-types - Create new outcome type
outcomeTypes.post(
  "/",
  requireAuth,
  requireSuperAdmin,
  describe({
    tags: TAGS,
    summary: "Create an outcome type",
    auth: true,
    role: true,
    notFound: true,
    success: { status: 201, description: "Outcome type created", schema: outcomeTypeSchema },
  }),
  validate("json", createOutcomeTypeSchema),
  async (c) => {
    const data = c.req.valid("json");
    const outcomeType = await outcomeTypeService.createOutcomeType(data);
    return c.json(outcomeType, 201);
  },
);

// GET /outcome-types - List all outcome types (with optional disciplineId filter)
outcomeTypes.get(
  "/",
  describe({
    tags: TAGS,
    summary: "List outcome types",
    description:
      "Archived types are omitted unless includeArchived=true, which the admin screens use to offer a restore.",
    success: { description: "Matching outcome types", schema: outcomeTypeListSchema },
  }),
  validate(
    "query",
    z.object({
      disciplineId: z.string().optional(),
      includeArchived: z.stringbool().optional(),
    }),
  ),
  async (c) => {
    const { disciplineId, includeArchived } = c.req.valid("query");
    const outcomeTypesList = await outcomeTypeService.listOutcomeTypes(disciplineId, includeArchived ?? false);
    return c.json(outcomeTypesList);
  },
);

// GET /outcome-types/:id - Get single outcome type
outcomeTypes.get(
  "/:id",
  describe({
    tags: TAGS,
    summary: "Get an outcome type",
    notFound: true,
    success: { description: "The outcome type", schema: outcomeTypeSchema },
  }),
  async (c) => {
    const id = c.req.param("id")!;
    const outcomeType = await outcomeTypeService.getOutcomeTypeById(id);
    return c.json(outcomeType);
  },
);

// PATCH /outcome-types/:id - Update outcome type
outcomeTypes.patch(
  "/:id",
  requireAuth,
  requireSuperAdmin,
  describe({
    tags: TAGS,
    summary: "Update an outcome type",
    auth: true,
    role: true,
    notFound: true,
    success: { description: "The updated outcome type", schema: outcomeTypeSchema },
  }),
  validate("json", updateOutcomeTypeSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const data = c.req.valid("json");
    const outcomeType = await outcomeTypeService.updateOutcomeType(id, data);
    return c.json(outcomeType);
  },
);

// POST /outcome-types/:id/archive - Archive outcome type (non-destructive retirement)
outcomeTypes.post(
  "/:id/archive",
  requireAuth,
  requireSuperAdmin,
  describe({
    tags: TAGS,
    summary: "Archive an outcome type",
    description:
      "Removes it from match entry while every match already tagged with it keeps its points and MMR multiplier. Also clears the default flag.",
    auth: true,
    role: true,
    notFound: true,
    conflict: true,
    success: { description: "The archived outcome type", schema: outcomeTypeSchema },
  }),
  async (c) => {
    const id = c.req.param("id")!;
    const outcomeType = await outcomeTypeService.archiveOutcomeType(id, c.get("appUserId"));
    return c.json(outcomeType);
  },
);

// POST /outcome-types/:id/restore - Restore an archived outcome type
outcomeTypes.post(
  "/:id/restore",
  requireAuth,
  requireSuperAdmin,
  describe({
    tags: TAGS,
    summary: "Restore an archived outcome type",
    auth: true,
    role: true,
    notFound: true,
    conflict: true,
    success: { description: "The restored outcome type", schema: outcomeTypeSchema },
  }),
  async (c) => {
    const id = c.req.param("id")!;
    const outcomeType = await outcomeTypeService.restoreOutcomeType(id);
    return c.json(outcomeType);
  },
);

// DELETE /outcome-types/:id - Delete outcome type
outcomeTypes.delete(
  "/:id",
  requireAuth,
  requireSuperAdmin,
  describe({
    tags: TAGS,
    summary: "Delete an outcome type",
    description:
      "Only while no match was played under it. Otherwise answers 409 with the match count; archive it instead.",
    auth: true,
    role: true,
    notFound: true,
    conflict: true,
    success: { description: "Deletion outcome", schema: mutationResultSchema },
  }),
  async (c) => {
    const id = c.req.param("id")!;
    const result = await outcomeTypeService.deleteOutcomeType(id);
    return c.json(result);
  },
);

export default outcomeTypes;
