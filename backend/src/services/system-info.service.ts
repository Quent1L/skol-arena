import { join } from "node:path";
import type { SystemInfo } from "@skol-arena/shared";
import { API_VERSIONS, LATEST_API_VERSION } from "../api/versions";
import { describeEnvironment } from "../config/env-catalog";
import { systemInfoRepository } from "../repository/system-info.repository";
import { avatarStorageMigrationService } from "./avatar-storage-migration.service";

const startedAt = new Date();

/**
 * The release version, read from the frontend build that ships in the same image.
 * Null in development, where nothing has been built.
 */
async function readAppVersion(): Promise<string | null> {
  const buildPath = process.env.FRONTEND_BUILD_PATH;
  if (!buildPath) return null;
  try {
    const manifest = (await Bun.file(join(buildPath, "version.json")).json()) as { version?: unknown };
    return typeof manifest.version === "string" ? manifest.version : null;
  } catch {
    return null;
  }
}

async function getDatabaseInfo(): Promise<SystemInfo["database"]> {
  const [serverVersion, sizeBytes, tables, migrations] = await Promise.all([
    systemInfoRepository.getServerVersion(),
    systemInfoRepository.getDatabaseSize(),
    systemInfoRepository.getLargestTables(),
    systemInfoRepository.getMigrations(),
  ]);
  return { serverVersion, sizeBytes, tables, migrations };
}

export const systemInfoService = {
  async getSystemInfo(): Promise<SystemInfo> {
    const [version, database, avatarStorage] = await Promise.all([
      readAppVersion(),
      getDatabaseInfo(),
      avatarStorageMigrationService.getReport(),
    ]);
    return {
      application: {
        version,
        bunVersion: Bun.version,
        nodeEnv: process.env.NODE_ENV ?? null,
        startedAt,
        apiVersions: [...API_VERSIONS],
        latestApiVersion: LATEST_API_VERSION,
      },
      database,
      avatarStorage,
      environment: describeEnvironment(),
    };
  },
};
