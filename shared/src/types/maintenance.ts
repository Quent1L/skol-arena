import { z } from "zod";

// ============================================
// Technical maintenance (super admin)
// ============================================

export const avatarStorageDriverEnum = ["postgres", "filesystem"] as const;

export const avatarStorageDriverSchema = z.enum(avatarStorageDriverEnum);

export type AvatarStorageDriver = z.infer<typeof avatarStorageDriverSchema>;

/**
 * Computed once at startup and after each migration, so reading it costs nothing.
 * `strandedDrivers` lists the inactive stores that still hold avatar objects.
 */
export const maintenanceStatusSchema = z
  .object({
    avatarStorage: z.object({
      driver: avatarStorageDriverSchema,
      strandedDrivers: z.array(avatarStorageDriverSchema),
    }),
  })
  .meta({ id: "MaintenanceStatus" });

export type MaintenanceStatus = z.infer<typeof maintenanceStatusSchema>;

/** Where each current avatar was found, checked one by one. */
export const avatarStorageReportSchema = z
  .object({
    driver: avatarStorageDriverSchema,
    total: z.number().int(),
    inActive: z.number().int(),
    stranded: z.array(z.object({ driver: avatarStorageDriverSchema, count: z.number().int() })),
    /** Current avatars found in no store at all. */
    missing: z.number().int(),
    /** Inactive stores holding objects, current or orphaned. */
    strandedDrivers: z.array(avatarStorageDriverSchema),
  })
  .meta({ id: "AvatarStorageReport" });

export type AvatarStorageReport = z.infer<typeof avatarStorageReportSchema>;

export const avatarMigrationResultSchema = z
  .object({
    migrated: z.number().int(),
    failed: z.number().int(),
    /** Current avatars found in no store, left untouched. */
    missing: z.number().int(),
    report: avatarStorageReportSchema,
  })
  .meta({ id: "AvatarMigrationResult" });

export type AvatarMigrationResult = z.infer<typeof avatarMigrationResultSchema>;

export const environmentVariableSchema = z
  .object({
    name: z.string(),
    group: z.string(),
    secret: z.boolean(),
    configured: z.boolean(),
    /** Always null for a secret. */
    value: z.string().nullable(),
  })
  .meta({ id: "EnvironmentVariable" });

export type EnvironmentVariable = z.infer<typeof environmentVariableSchema>;

export const databaseInfoSchema = z
  .object({
    serverVersion: z.string(),
    sizeBytes: z.number(),
    tables: z.array(z.object({ name: z.string(), sizeBytes: z.number(), rows: z.number() })),
    // `latestMigrationAt` is when the newest applied migration was authored, as Drizzle records it.
    migrations: z.object({ applied: z.number().int(), latestMigrationAt: z.date().nullable() }),
  })
  .meta({ id: "DatabaseInfo" });

export type DatabaseInfo = z.infer<typeof databaseInfoSchema>;

export const systemInfoSchema = z
  .object({
    application: z.object({
      version: z.string().nullable(),
      bunVersion: z.string(),
      nodeEnv: z.string().nullable(),
      startedAt: z.date(),
      apiVersions: z.array(z.string()),
      latestApiVersion: z.string(),
    }),
    database: databaseInfoSchema,
    avatarStorage: avatarStorageReportSchema,
    environment: z.array(environmentVariableSchema),
  })
  .meta({ id: "SystemInfo" });

export type SystemInfo = z.infer<typeof systemInfoSchema>;
