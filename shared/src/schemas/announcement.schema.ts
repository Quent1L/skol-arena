import { z } from "zod";
import { translateValidation, vmsg } from "../types/validation-messages";

export const ANNOUNCEMENT_TITLE_MAX = 200;
export const ANNOUNCEMENT_BODY_MAX = 2000;

/** `all` reaches every player of the app (super admins only); `tournament` one tournament's players. */
export const announcementAudienceSchema = z.enum(["all", "tournament"]);

export const createAnnouncementSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, vmsg("validation.titleRequired"))
      .max(ANNOUNCEMENT_TITLE_MAX, vmsg("validation.titleMax200")),
    body: z
      .string()
      .trim()
      .min(1, vmsg("validation.contentRequired"))
      .max(ANNOUNCEMENT_BODY_MAX, vmsg("validation.announcementBodyMax")),
    audience: announcementAudienceSchema,
    tournamentId: z.uuid().nullable().optional(),
    /** Delivered as a notification in the bell (and as a push on subscribed devices). */
    inFeed: z.boolean(),
    /** Shown once as a pop-up: on opening the tournament, or the app for `all`. */
    asPopup: z.boolean(),
    /** Past it, the pop-up stops showing. Null: no end. */
    expiresAt: z.coerce.date().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.expiresAt && value.expiresAt.getTime() <= Date.now()) {
      ctx.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: translateValidation("validation.announcementExpiryPast"),
      });
    }
    if (value.audience === "tournament" && !value.tournamentId) {
      ctx.addIssue({
        code: "custom",
        path: ["tournamentId"],
        message: translateValidation("validation.announcementTournamentRequired"),
      });
    }
    if (!value.inFeed && !value.asPopup) {
      ctx.addIssue({
        code: "custom",
        path: ["asPopup"],
        message: translateValidation("validation.announcementChannelRequired"),
      });
    }
  });

export const listAnnouncementsQuerySchema = z.object({
  tournamentId: z.uuid().optional(),
});

export const pendingAnnouncementsQuerySchema = z.object({
  /** Without it, only the app-wide pop-ups are returned. */
  tournamentId: z.uuid().optional(),
});

export const announcementSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    body: z.string(),
    audience: announcementAudienceSchema,
    tournamentId: z.string().nullable(),
    tournamentName: z.string().nullable(),
    inFeed: z.boolean(),
    asPopup: z.boolean(),
    expiresAt: z.iso.datetime().nullable(),
    createdBy: z.string().nullable(),
    authorName: z.string().nullable(),
    /** How many players received it in their feed. */
    recipientCount: z.number().int(),
    /** How many players dismissed its pop-up. */
    seenCount: z.number().int(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "Announcement" });

export const announcementListSchema = z.array(announcementSchema);

export type AnnouncementAudience = z.infer<typeof announcementAudienceSchema>;
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
export type Announcement = z.infer<typeof announcementSchema>;

/** What a player's pop-up needs — no counters, no author. */
export const announcementPopupSchema = announcementSchema
  .pick({ id: true, title: true, body: true, audience: true, tournamentId: true, createdAt: true })
  .meta({ id: "AnnouncementPopup" });

export const announcementPopupListSchema = z.array(announcementPopupSchema);

export type AnnouncementPopup = z.infer<typeof announcementPopupSchema>;
