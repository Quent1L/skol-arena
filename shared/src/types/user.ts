import { z } from "zod";
import { userRoleEnum } from "./enums";

// ============================================
// Types and interfaces for users
// ============================================

export const userSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    emailVerified: z.boolean(),
    image: z.string().optional(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "User" });

export type User = z.infer<typeof userSchema>;

export const appUserSchema = z
  .object({
    id: z.string(),
    /** Reference to the Better Auth user. */
    externalId: z.string(),
    displayName: z.string(),
    shortName: z.string(),
    role: z.enum(userRoleEnum),
    /** Current avatar version; null when the player has none. */
    avatarVersion: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "AppUser" });

export type AppUser = z.infer<typeof appUserSchema>;

/**
 * An app user joined with the Better Auth record behind it. `betterAuth` fields are
 * all optional: the join is a left join, and a user whose external record is gone
 * still has an app profile.
 */
export const appUserWithAuthSchema = appUserSchema
  .extend({
    betterAuth: z.object({
      id: z.string().optional(),
      email: z.string().optional(),
      name: z.string().optional(),
      image: z.string().nullish(),
      emailVerified: z.boolean().optional(),
      createdAt: z.iso.datetime().optional(),
      updatedAt: z.iso.datetime().optional(),
    }),
  })
  .meta({ id: "AppUserWithAuth" });

export type AppUserWithAuth = z.infer<typeof appUserWithAuthSchema>;

export const userStatsSchema = z
  .object({
    total_matches: z.number(),
    wins: z.number(),
    draws: z.number(),
    losses: z.number(),
    win_rate: z.number(),
    average_score: z.number(),
    tournaments_participated: z.number(),
  })
  .meta({ id: "UserStats" });

export type UserStats = z.infer<typeof userStatsSchema>;

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  email: string;
  password: string;
  passwordConfirm?: string;
  name?: string;
  displayName?: string;
}

export interface UserWithStats extends AppUser {
  stats?: UserStats;
}
