/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";

import { notificationActionService } from "../notification-action.service";
import { matchRepository } from "../../repository/match.repository";
import { matchConfirmationRepository } from "../../repository/match-confirmation.repository";

type Notif = Parameters<typeof notificationActionService.resolvePendingActions>[0][number];

function notif(overrides: Partial<Notif> = {}): Notif {
  return {
    id: "n-1",
    type: "MATCH_POST_DISPUTE",
    requiresAction: true,
    matchId: "m-1",
    ...overrides,
  } as Notif;
}

let statusQueries: string[][] = [];

beforeEach(() => {
  statusQueries = [];
  (matchRepository as any).getStatusesByIds = async (ids: string[]) => {
    statusQueries.push(ids);
    return ids.map((id) => ({ id, status: "finalized" }));
  };
  (matchConfirmationRepository as any).getMatchIdsWithOpenPostDispute = async (ids: string[]) => ids;
});

afterEach(() => {
  const restore = (instance: object) => {
    if (Object.getPrototypeOf(instance) === Object.prototype) return;
    for (const key of Object.getOwnPropertyNames(instance)) {
      delete (instance as Record<string, unknown>)[key];
    }
  };
  restore(matchRepository);
  restore(matchConfirmationRepository);
});

describe("NotificationActionService", () => {
  it("keeps a post-dispute request pending while the contestation stands", async () => {
    const pending = await notificationActionService.resolvePendingActions([notif()]);

    expect([...pending]).toEqual(["n-1"]);
  });

  it("releases the post-dispute request once the contestation is withdrawn", async () => {
    (matchConfirmationRepository as any).getMatchIdsWithOpenPostDispute = async () => [];

    const pending = await notificationActionService.resolvePendingActions([notif()]);

    expect(pending.size).toBe(0);
  });

  it("releases an escalation once the match has left the conflict", async () => {
    (matchRepository as any).getStatusesByIds = async () => [{ id: "m-1", status: "reported" }];

    const escalation = notif({ type: "MATCH_DISPUTE_ESCALATED" });
    expect((await notificationActionService.resolvePendingActions([escalation])).size).toBe(0);

    (matchRepository as any).getStatusesByIds = async () => [{ id: "m-1", status: "disputed" }];
    expect([...(await notificationActionService.resolvePendingActions([escalation]))]).toEqual(["n-1"]);
  });

  it("keeps a validation request pending while the result awaits an answer", async () => {
    (matchRepository as any).getStatusesByIds = async () => [{ id: "m-1", status: "reported" }];

    const pending = await notificationActionService.resolvePendingActions([notif({ type: "MATCH_VALIDATION" })]);

    expect([...pending]).toEqual(["n-1"]);
  });

  it("releases an orphaned notification whose match is gone", async () => {
    // matches.id is set to null on the notification when the match is deleted
    const orphan = notif({ matchId: null });
    expect((await notificationActionService.resolvePendingActions([orphan])).size).toBe(0);
    expect(statusQueries).toHaveLength(0);

    (matchRepository as any).getStatusesByIds = async () => [];
    expect((await notificationActionService.resolvePendingActions([notif()])).size).toBe(0);
  });

  it("ignores notifications that ask for nothing", async () => {
    const pending = await notificationActionService.resolvePendingActions([
      notif({ type: "MATCH_MESSAGE", requiresAction: false }),
    ]);

    expect(pending.size).toBe(0);
    expect(statusQueries).toHaveLength(0);
  });

  it("resolves a whole list with one lookup per repository", async () => {
    const pending = await notificationActionService.resolvePendingActions([
      notif({ id: "n-1", matchId: "m-1" }),
      notif({ id: "n-2", matchId: "m-1" }),
      notif({ id: "n-3", matchId: "m-2" }),
    ]);

    expect([...pending].sort()).toEqual(["n-1", "n-2", "n-3"]);
    expect(statusQueries).toEqual([["m-1", "m-2"]]);
  });
});
