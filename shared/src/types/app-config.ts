import { z } from "zod";

// ============================================
// Runtime configuration served to the client
// ============================================

export const keycloakConfigSchema = z
  .object({
    enabled: z.boolean(),
    clientId: z.string().nullable(),
    issuer: z.string().nullable(),
    realm: z.string().nullable(),
    loginLabel: z.string().nullable(),
  })
  .meta({ id: "KeycloakConfig" });

export type KeycloakConfig = z.infer<typeof keycloakConfigSchema>;

export const emailPasswordConfigSchema = z.object({ enabled: z.boolean() }).meta({ id: "EmailPasswordConfig" });

export type EmailPasswordConfig = z.infer<typeof emailPasswordConfigSchema>;

export const authConfigSchema = z
  .object({
    emailPassword: emailPasswordConfigSchema,
    keycloak: keycloakConfigSchema,
  })
  .meta({ id: "AuthConfig" });

export type AuthConfig = z.infer<typeof authConfigSchema>;

export const rankedConfigSchema = z
  .object({
    /**
     * How long after being played a ranked match may still be reported, in hours.
     * `0` means the server enforces no limit — a test/backfill setting.
     */
    matchMaxAgeHours: z.number(),
  })
  .meta({ id: "RankedConfig" });

export type RankedConfig = z.infer<typeof rankedConfigSchema>;

export const demoConfigSchema = z.object({ email: z.string(), password: z.string() }).meta({ id: "DemoConfig" });

export type DemoConfig = z.infer<typeof demoConfigSchema>;

/**
 * What GET /config returns: the handful of server settings the SPA needs before a
 * user is known — which sign-in methods are available, the push public key, and the
 * ranked reporting window the match form has to mirror.
 */
export const appConfigSchema = z
  .object({
    vapidPublicKey: z.string().nullable(),
    auth: authConfigSchema,
    ranked: rankedConfigSchema,
    /** Sign-in of the demo super admin, shown on the login screen. Null outside a demo instance. */
    demo: demoConfigSchema.nullable(),
  })
  .meta({ id: "AppConfig" });

export type AppConfig = z.infer<typeof appConfigSchema>;
