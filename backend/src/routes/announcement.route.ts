import { z } from "zod";
import { validate } from "../api/validator";
import { describe } from "../api/describe";
import { announcementService } from "../services/announcement.service";
import {
  createAnnouncementSchema,
  listAnnouncementsQuerySchema,
  pendingAnnouncementsQuerySchema,
  announcementListSchema,
  announcementPopupListSchema,
  mutationResultSchema,
} from "@skol-arena/shared";
import { requireAuth } from "../middleware/auth";
import { createAppHono } from "../types/hono";

const app = createAppHono();

const TAGS = ["Announcements"];
const idParam = validate("param", z.object({ id: z.uuid() }));

app.post(
  "/announcements",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Publish an announcement",
    description:
      "Sent to every active player of one tournament (whoever manages it) or of the " +
      "whole app (super admins only). `inFeed` fans it out as notifications and pushes; " +
      "`asPopup` shows it once when the player opens the tournament, or the app.",
    auth: true,
    role: true,
    notFound: true,
    success: {
      status: 201,
      description: "The announcement was published",
      schema: z.object({ id: z.string() }),
    },
  }),
  validate("json", createAnnouncementSchema),
  async (c) => {
    const created = await announcementService.create(c.get("appUserId"), c.req.valid("json"));
    return c.json(created, 201);
  },
);

app.get(
  "/announcements",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "List announcements",
    description:
      "Every announcement for a super admin; with `tournamentId`, that tournament's, " +
      "for whoever manages it.",
    auth: true,
    role: true,
    success: { description: "Announcements, newest first", schema: announcementListSchema },
  }),
  validate("query", listAnnouncementsQuerySchema),
  async (c) => {
    const { tournamentId } = c.req.valid("query");
    return c.json(await announcementService.list(c.get("appUserId"), tournamentId));
  },
);

app.delete(
  "/announcements/:id",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Delete an announcement",
    description: "Its pop-up stops showing and its copies leave every feed.",
    auth: true,
    role: true,
    notFound: true,
    success: { description: "The announcement was deleted", schema: mutationResultSchema },
  }),
  idParam,
  async (c) => {
    await announcementService.delete(c.get("appUserId"), c.req.valid("param").id);
    return c.json({ success: true });
  },
);

app.get(
  "/me/announcements/pending",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Pop-ups the current user has not dismissed",
    description:
      "Without `tournamentId`, the app-wide ones. With it, that tournament's — only " +
      "while the user is one of its active players. Oldest first.",
    auth: true,
    success: { description: "Pending pop-ups", schema: announcementPopupListSchema },
  }),
  validate("query", pendingAnnouncementsQuerySchema),
  async (c) => {
    const { tournamentId } = c.req.valid("query");
    return c.json(await announcementService.getPendingPopups(c.get("appUserId"), tournamentId));
  },
);

app.post(
  "/me/announcements/:id/seen",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Dismiss an announcement pop-up",
    description: "It will not show again, and its copy in the feed is marked read.",
    auth: true,
    notFound: true,
    success: { description: "The pop-up was dismissed", schema: mutationResultSchema },
  }),
  idParam,
  async (c) => {
    await announcementService.markSeen(c.get("appUserId"), c.req.valid("param").id);
    return c.json({ success: true });
  },
);

export default app;
