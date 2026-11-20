import { describe, it, expect } from "bun:test";
import { reportEmailDeliveryFailure, withStrictEmailDelivery } from "../email-delivery-context";

describe("email delivery context", () => {
  it("rethrows a failure reported from inside the strict scope", async () => {
    const failure = new Error("SMTP down");

    await expect(
      withStrictEmailDelivery(async () => {
        expect(reportEmailDeliveryFailure(failure)).toBe(true);
        return "endpoint resolved anyway";
      }),
    ).rejects.toBe(failure);
  });

  it("returns the result when nothing was reported", async () => {
    const result = await withStrictEmailDelivery(async () => "ok");
    expect(result).toBe("ok");
  });

  it("keeps the first failure when several are reported", async () => {
    const first = new Error("first");

    await expect(
      withStrictEmailDelivery(async () => {
        reportEmailDeliveryFailure(first);
        reportEmailDeliveryFailure(new Error("second"));
      }),
    ).rejects.toBe(first);
  });

  it("reports nothing outside the strict scope", () => {
    // The public forgot-password flow: the hook must handle the error itself.
    expect(reportEmailDeliveryFailure(new Error("SMTP down"))).toBe(false);
  });

  it("does not leak into a sibling async task", async () => {
    const reported: boolean[] = [];

    const sibling = new Promise<void>((resolve) => {
      setTimeout(() => {
        reported.push(reportEmailDeliveryFailure(new Error("SMTP down")));
        resolve();
      }, 0);
    });

    await withStrictEmailDelivery(async () => {
      await sibling;
    });

    expect(reported).toEqual([false]);
  });
});
