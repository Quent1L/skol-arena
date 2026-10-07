/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";

import { matchNotificationBuilder } from "../match-notification.builder";
import { matchRepository } from "../../repository/match.repository";
import { tournamentRepository } from "../../repository/tournament.repository";
import { userRepository } from "../../repository/user.repository";
import { notificationService } from "../notification.service";

let sentPayloads: any[] = [];

beforeEach(() => {
  sentPayloads = [];
  (notificationService as any).send = async (payload: any) => {
    sentPayloads.push(payload);
    return undefined;
  };
  (userRepository as any).getById = async (id: string) =>
    ({ id, displayName: `User-${id}` });
  (matchRepository as any).getParticipationsByMatchId = async () => [
    { playerId: "p1", teamSide: "A" },
    { playerId: "p2", teamSide: "A" },
    { playerId: "p3", teamSide: "B" },
    { playerId: "p4", teamSide: "B" },
  ];
  (tournamentRepository as any).getAdminUserIds = async () => ["admin-1", "admin-2"];
  (notificationService as any).hasUnreadOfTypeForMatch = async () => false;
});

afterEach(() => {
  const restore = (instance: object) => {
    if (Object.getPrototypeOf(instance) === Object.prototype) return;
    for (const key of Object.getOwnPropertyNames(instance)) {
      delete (instance as Record<string, unknown>)[key];
    }
  };
  restore(matchRepository);
  restore(tournamentRepository);
  restore(userRepository);
  restore(notificationService);
});

describe("MatchNotificationBuilder", () => {
  it("notifyMatchCreated sends notification to all participants except creator with rich context", async () => {
    (matchRepository as any).getById = async () => ({
      id: "m-1",
      tournamentId: "t-1",
      status: "scheduled",
      playedAt: new Date("2026-06-01T15:00:00Z"),
    });

    await matchNotificationBuilder.notifyMatchCreated("m-1", "p1", "Tour");

    expect(sentPayloads).toHaveLength(3); // p2, p3, p4
    const p2Notif = sentPayloads.find((p) => p.userId === "p2");
    expect(p2Notif).toBeDefined();
    expect(p2Notif.type).toBe("MATCH_CREATED");
    expect(p2Notif.translationParams.creatorName).toBe("User-p1");
    expect(p2Notif.translationParams.tournamentName).toBe("Tour");
    expect(p2Notif.translationParams.matchFormat).toBe("2v2");
    // p2 is on team A — teammates exclude p2 itself, so only p1
    expect(p2Notif.translationParams.teammates).toBe("User-p1");
    expect(p2Notif.translationParams.opponents).toBe("User-p3, User-p4");
    expect(p2Notif.requiresAction).toBe(false);
    // Raw instant, so the reader's device owns the locale and the timezone
    expect(p2Notif.translationParams.matchDate).toBe("2026-06-01T15:00:00.000Z");
    expect(p2Notif.matchId).toBe("m-1");
  });

  it("reports matchFormat from the recipient's point of view on an uneven match", async () => {
    (matchRepository as any).getById = async () => ({
      id: "m-6",
      tournamentId: "t-1",
      status: "scheduled",
      playedAt: new Date("2026-06-01T15:00:00Z"),
    });
    (matchRepository as any).getParticipationsByMatchId = async () => [
      { playerId: "p1", teamSide: "A" },
      { playerId: "p2", teamSide: "A" },
      { playerId: "p3", teamSide: "B" },
    ];

    await matchNotificationBuilder.notifyMatchCreated("m-6", "p1", "Tour");

    // p2 is the outnumbering side, p3 the lone one — each reads its own side first
    expect(sentPayloads.find((p) => p.userId === "p2").translationParams.matchFormat).toBe("2v1");
    expect(sentPayloads.find((p) => p.userId === "p3").translationParams.matchFormat).toBe("1v2");
  });

  it("stores a null matchDate when the match has no date yet", async () => {
    (matchRepository as any).getById = async () => ({
      id: "m-4",
      tournamentId: "t-1",
      status: "draft",
      playedAt: null,
    });

    await matchNotificationBuilder.notifyMatchCreated("m-4", "p1", "Tour");

    expect(sentPayloads[0].translationParams.matchDate).toBeNull();
  });

  it("leaves participant lists empty rather than baking in a localized label", async () => {
    (matchRepository as any).getById = async () => ({
      id: "m-5",
      tournamentId: "t-1",
      status: "scheduled",
      playedAt: new Date("2026-06-01T15:00:00Z"),
    });
    (matchRepository as any).getParticipationsByMatchId = async () => [
      { playerId: "p1", teamSide: "A" },
      { playerId: "p3", teamSide: "B" },
    ];

    await matchNotificationBuilder.notifyMatchCreated("m-5", "p1", "Tour");

    expect(sentPayloads[0].translationParams.teammates).toBe("");
  });

  it("notifyMatchValidationRequired sends action notification with reporter context", async () => {
    (matchRepository as any).getById = async () => ({
      id: "m-2",
      tournamentId: "t-1",
      status: "reported",
      playedAt: new Date("2026-06-02T15:00:00Z"),
    });
    (matchRepository as any).getTournament = async () => ({
      id: "t-1",
      name: "Tournament X",
    });

    await matchNotificationBuilder.notifyMatchValidationRequired("m-2", "p3");

    expect(sentPayloads).toHaveLength(3); // p1, p2, p4
    const p4Notif = sentPayloads.find((p) => p.userId === "p4");
    expect(p4Notif).toBeDefined();
    expect(p4Notif.type).toBe("MATCH_VALIDATION");
    expect(p4Notif.translationParams.reporterName).toBe("User-p3");
    expect(p4Notif.translationParams.tournamentName).toBe("Tournament X");
    // p4 is on team B — teammates is p3
    expect(p4Notif.translationParams.teammates).toBe("User-p3");
    expect(p4Notif.translationParams.opponents).toBe("User-p1, User-p2");
    expect(p4Notif.requiresAction).toBe(true);
    expect(p4Notif.matchId).toBe("m-2");
  });

  it("notifyDisputeEscalation raises an actionable task for the tournament organizers", async () => {
    (matchRepository as any).getById = async () => ({
      id: "m-3",
      tournamentId: "t-1",
      status: "disputed",
      playedAt: new Date("2026-06-01T15:00:00Z"),
    });
    (matchRepository as any).getTournament = async () => ({ name: "Tour" });

    await matchNotificationBuilder.notifyDisputeEscalation("m-3", "p3");

    // Organizers only — the players are not asked to arbitrate their own dispute
    expect(sentPayloads.map((p) => p.userId).sort()).toEqual(["admin-1", "admin-2"]);
    const sample = sentPayloads[0];
    expect(sample.type).toBe("MATCH_DISPUTE_ESCALATED");
    expect(sample.translationParams.disputerName).toBe("User-p3");
    expect(sample.translationParams.tournamentName).toBe("Tour");
    expect(sample.requiresAction).toBe(true);
    expect(sample.matchId).toBe("m-3");
  });

  it("notifyPostFinalizationDispute asks the organizers to arbitrate and merely informs the players", async () => {
    (matchRepository as any).getById = async () => ({
      id: "m-8",
      tournamentId: "t-1",
      status: "finalized",
      playedAt: new Date("2026-06-01T15:00:00Z"),
    });
    (matchRepository as any).getTournament = async () => ({ name: "Tour" });

    await matchNotificationBuilder.notifyPostFinalizationDispute("m-8", "p1");

    expect(sentPayloads.map((p) => p.userId).sort()).toEqual([
      "admin-1",
      "admin-2",
      "p2",
      "p3",
      "p4",
    ]);
    for (const payload of sentPayloads) {
      expect(payload.type).toBe("MATCH_POST_DISPUTE");
      expect(payload.matchId).toBe("m-8");
      expect(payload.translationParams.disputerName).toBe("User-p1");
      // Only the organizers are asked to do something about it
      expect(payload.requiresAction).toBe(payload.userId.startsWith("admin-"));
    }
  });

  it("notifyMatchMessage skips recipients who already have an unread message notification", async () => {
    (matchRepository as any).getById = async () => ({
      id: "m-7",
      tournamentId: "t-1",
      status: "disputed",
    });
    (notificationService as any).hasUnreadOfTypeForMatch = async (userId: string) =>
      userId === "p3";

    await matchNotificationBuilder.notifyMatchMessage("m-7", "p1");

    // p1 is the author, p3 already has a pending one
    expect(sentPayloads.map((p) => p.userId).sort()).toEqual([
      "admin-1",
      "admin-2",
      "p2",
      "p4",
    ]);
    expect(sentPayloads[0].type).toBe("MATCH_MESSAGE");
    expect(sentPayloads[0].requiresAction).toBe(false);
  });

  it("returns silently when match not found", async () => {
    (matchRepository as any).getById = async () => null;

    await matchNotificationBuilder.notifyMatchCreated("missing", "p1", "Tour");
    await matchNotificationBuilder.notifyMatchValidationRequired("missing", "p1");
    await matchNotificationBuilder.notifyDisputeEscalation("missing", "p1");
    await matchNotificationBuilder.notifyMatchMessage("missing", "p1");

    expect(sentPayloads).toHaveLength(0);
  });
});

describe("MatchNotificationBuilder - result corrected", () => {
  const match = { id: "m-1", playedAt: new Date("2026-06-01T15:00:00Z") };

  it("tells every other player, author included when an organizer corrects", async () => {
    (notificationService as any).getUserIdsWithUnreadOfTypeForMatch = async () => new Set();

    await matchNotificationBuilder.notifyResultCorrected(match, "Tour", { id: "admin-1", displayName: "Org" });

    expect(sentPayloads.map((p) => p.userId).sort()).toEqual(["p1", "p2", "p3", "p4"]);
    expect(sentPayloads[0]).toMatchObject({
      type: "MATCH_RESULT_CORRECTED",
      requiresAction: false,
      actionUrl: "/matches/m-1",
      translationParams: { authorName: "Org", tournamentName: "Tour", matchDate: "2026-06-01T15:00:00.000Z" },
    });
  });

  it("skips the corrector and anyone who has not read the previous correction notice", async () => {
    (notificationService as any).getUserIdsWithUnreadOfTypeForMatch = async () => new Set(["p3"]);

    await matchNotificationBuilder.notifyResultCorrected(match, "Tour", { id: "p1", displayName: "Ann" });

    expect(sentPayloads.map((p) => p.userId).sort()).toEqual(["p2", "p4"]);
  });
});
