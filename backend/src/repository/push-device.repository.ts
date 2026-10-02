import { eq, and } from "drizzle-orm";
import { db } from "../config/database";
import { userPushDevices } from "../db/schema";
import { RegisterDevice } from "@skol-arena/shared";
import { logger } from "../utils/logger";

export const pushDeviceRepository = {
  async findByEndpoint(endpoint: string) {
    const [device] = await db
      .select()
      .from(userPushDevices)
      .where(eq(userPushDevices.subscriptionEndpoint, endpoint));
    return device ?? null;
  },

  async register(userId: string, data: RegisterDevice) {
    logger.debug({ userId }, '[PushDeviceRepo] Registering device for user:');
    logger.debug({ endpoint: data.subscriptionEndpoint }, '[PushDeviceRepo] Endpoint:');
    
    // Check if device already exists with this endpoint
    const [existing] = await db
      .select()
      .from(userPushDevices)
      .where(
        eq(userPushDevices.subscriptionEndpoint, data.subscriptionEndpoint)
      );

    if (existing) {
      logger.debug({ id: existing.id }, '[PushDeviceRepo] Device already exists, updating:');
      const result = await db
        .update(userPushDevices)
        .set({
          userId,
          active: true,
          updatedAt: new Date(),
          subscriptionData: JSON.stringify(data.subscriptionData),
          locale: data.locale ?? null,
          timezone: data.timezone ?? null,
        })
        .where(eq(userPushDevices.id, existing.id))
        .returning();
      logger.debug('[PushDeviceRepo] Device updated successfully');
      return result;
    }

    logger.debug('[PushDeviceRepo] Creating new device entry');
    const result = await db
      .insert(userPushDevices)
      .values({
        userId,
        deviceType: data.deviceType,
        subscriptionEndpoint: data.subscriptionEndpoint,
        subscriptionData: JSON.stringify(data.subscriptionData),
        active: true,
        locale: data.locale ?? null,
        timezone: data.timezone ?? null,
      })
      .returning();
    logger.debug({ id: result[0]?.id }, '[PushDeviceRepo] Device created successfully:');
    return result;
  },

  async remove(userId: string, deviceId: string) {
    return await db
      .delete(userPushDevices)
      .where(
        and(
          eq(userPushDevices.id, deviceId),
          eq(userPushDevices.userId, userId)
        )
      )
      .returning();
  },

  async getActiveForUser(userId: string) {
    return await db
      .select()
      .from(userPushDevices)
      .where(
        and(
          eq(userPushDevices.userId, userId),
          eq(userPushDevices.active, true)
        )
      );
  },
};
