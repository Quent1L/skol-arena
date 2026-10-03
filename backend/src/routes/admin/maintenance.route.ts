import { describe, type DescribeOptions } from "../../api/describe";
import { createAppHono } from "../../types/hono";
import { requireAuth } from "../../middleware/auth";
import { requireSuperAdmin } from "../../middleware/require-role";
import { avatarStorageMigrationService } from "../../services/avatar-storage-migration.service";
import { systemInfoService } from "../../services/system-info.service";
import {
  avatarMigrationResultSchema,
  maintenanceStatusSchema,
  systemInfoSchema,
} from "@skol-arena/shared";

const adminMaintenance = createAppHono();

const TAGS = ["Admin — maintenance"];

adminMaintenance.use("*", requireAuth, requireSuperAdmin);

const adminRoute = (options: Omit<DescribeOptions, "tags" | "auth" | "role">) =>
  describe({ ...options, tags: TAGS, auth: true, role: true });

adminMaintenance.get(
  "/",
  adminRoute({
    summary: "Get system information",
    description:
      "Application and database versions, database size, avatar storage report and " +
      "the documented environment variables. Secrets only report whether they are set.",
    success: { description: "Current system information", schema: systemInfoSchema },
  }),
  async (c) => {
    return c.json(await systemInfoService.getSystemInfo());
  }
);

adminMaintenance.get(
  "/status",
  adminRoute({
    summary: "Get maintenance status",
    description:
      "Cheap health flags computed at startup and after each migration, such as " +
      "avatars left in a storage AVATAR_STORAGE no longer points at.",
    success: { description: "Cached maintenance flags", schema: maintenanceStatusSchema },
  }),
  (c) => {
    return c.json(avatarStorageMigrationService.getStatus());
  }
);

adminMaintenance.post(
  "/avatars/migrate",
  adminRoute({
    summary: "Migrate avatars to the configured storage",
    description:
      "Copies every current avatar into the storage AVATAR_STORAGE points at, then " +
      "deletes it from the other one. Idempotent: run it again to retry failures.",
    conflict: true,
    success: { description: "Migration outcome and fresh report", schema: avatarMigrationResultSchema },
  }),
  async (c) => {
    return c.json(await avatarStorageMigrationService.migrate());
  }
);

export default adminMaintenance;
