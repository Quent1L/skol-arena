import { describe, it, expect } from "bun:test";

import { PUSH_SERVICE_HOSTNAME, pushEndpointSchema } from "../src/schemas/push-endpoint";

describe("pushEndpointSchema", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://android.googleapis.com/gcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://web.push.apple.com/abc",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
  ])("accepts a known push service: %s", (url) => {
    expect(pushEndpointSchema.safeParse(url).success).toBe(true);
  });

  it.each([
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://evil.example.com/fcm.googleapis.com",
    "https://fcm.googleapis.com.evil.example.com/x",
    "https://localhost/push",
    "https://169.254.169.254/latest/meta-data",
    "not a url",
  ])("refuses anything else: %s", (url) => {
    expect(pushEndpointSchema.safeParse(url).success).toBe(false);
  });

  it("refuses an endpoint longer than 2048 characters", () => {
    const url = `https://fcm.googleapis.com/${"a".repeat(2100)}`;
    expect(pushEndpointSchema.safeParse(url).success).toBe(false);
  });

  it("matches hostnames case-insensitively and anchors both ends", () => {
    expect(PUSH_SERVICE_HOSTNAME.test("FCM.GoogleAPIs.com")).toBe(true);
    expect(PUSH_SERVICE_HOSTNAME.test("xfcm.googleapis.com")).toBe(false);
    expect(PUSH_SERVICE_HOSTNAME.test("fcm.googleapis.com.")).toBe(false);
  });
});
