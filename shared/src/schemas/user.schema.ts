import { z } from "zod";

// At least 2 letters/digits total; allows - and _ within words; single spaces between words.
export const displayNameRegex = /^(?=(?:.*[\p{L}\d]){2})[\p{L}\d_-]+(?: [\p{L}\d_-]+)*$/u;

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(3).max(50).regex(displayNameRegex),
  shortName: z
    .string()
    .trim()
    .min(3)
    .max(8)
    .regex(displayNameRegex)
    .transform((v) => v.toUpperCase()),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** Per-account settings, kept apart from the profile so a toggle never resends the names. */
export const userPreferencesSchema = z
  .object({
    /** Match entry starts with the user already picked as a player. */
    autoSelectSelfInMatch: z.boolean(),
  })
  .meta({ id: "UserPreferences" });

export type UserPreferences = z.infer<typeof userPreferencesSchema>;
