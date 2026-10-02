/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { notificationService } from "../notification.service";
import { pushDeviceRepository } from "../../repository/push-device.repository";
import { ForbiddenError } from "../../types/errors";
import { RegisterDeviceSchema } from "@skol-arena/shared";

// A plain object, not a class instance: keep the originals to put them back.
const original = { ...pushDeviceRepository };
const endpoint = "https://fcm.googleapis.com/fcm/send/abc";
let registered: string[];

beforeEach(() => {
  registered = [];
  (pushDeviceRepository as any).register = async (userId: string) => {
    registered.push(userId);
    return [];
  };
});

afterEach(() => {
  Object.assign(pushDeviceRepository, original);
});

function existingDevice(userId: string, auth: string) {
  (pushDeviceRepository as any).findByEndpoint = async () => ({
    id: "d-1",
    userId,
    subscriptionEndpoint: endpoint,
    subscriptionData: JSON.stringify({ keys: { p256dh: "p", auth } }),
  });
}

const registration = (auth: string) =>
  ({
    deviceType: "WEB",
    subscriptionEndpoint: endpoint,
    subscriptionData: { keys: { p256dh: "p", auth } },
  }) as any;

describe("push device registration", () => {
  it("refuses an endpoint that is not a browser push service", () => {
    for (const subscriptionEndpoint of [
      "http://fcm.googleapis.com/x",
      "https://127.0.0.1/x",
      "https://169.254.169.254/latest/meta-data",
      "https://fcm.googleapis.com.evil.com/x",
    ]) {
      expect(
        RegisterDeviceSchema.safeParse({ deviceType: "WEB", subscriptionEndpoint }).success,
      ).toBe(false);
    }
  });

  it("refuses to move another user's device without its auth secret", async () => {
    existingDevice("victim", "secret");
    await expect(
      notificationService.registerPushDevice("attacker", registration("guess")),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(registered).toEqual([]);
  });

  it("moves the device when the same browser signs in to another account", async () => {
    existingDevice("previous", "secret");
    await notificationService.registerPushDevice("next", registration("secret"));
    expect(registered).toEqual(["next"]);
  });
});
