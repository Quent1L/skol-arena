/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";

import { matchMessageService } from "../match-message.service";
import { matchMessageRepository } from "../../repository/match-message.repository";
import { matchRepository } from "../../repository/match.repository";
import { tournamentRepository } from "../../repository/tournament.repository";
import { userRepository } from "../../repository/user.repository";
import { matchNotificationBuilder } from "../match-notification.builder";
import { webSocketService } from "../websocket.service";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../types/errors";

let created: any[] = [];
let broadcasts: { userId: string; data: any }[] = [];
let notified = 0;

function reportedMatch(overrides: Record<string, unknown> = {}) {
  return {
    id: "m-1",
    tournamentId: "t-1",
    status: "reported",
    result: {},
    ...overrides,
  };
}

beforeEach(() => {
  created = [];
  broadcasts = [];
  notified = 0;

  (matchRepository as any).getById = async () => reportedMatch();
  (matchRepository as any).isUserInMatch = async () => true;
  (matchRepository as any).getParticipationsByMatchId = async () => [
    { playerId: "p1", sidePosition: 1 },
    { playerId: "p2", sidePosition: 2 },
  ];
  (tournamentRepository as any).getAdminUserIds = async () => ["admin-1"];
  (tournamentRepository as any).isUserTournamentAdmin = async () => false;
  (userRepository as any).getById = async (id: string) => ({
    id,
    displayName: `User-${id}`,
    role: "player",
  });
  (matchMessageRepository as any).listByMatch = async () => [];
  (matchMessageRepository as any).create = async (data: any) => {
    const row = { id: `msg-${created.length + 1}`, createdAt: new Date(), ...data };
    created.push(row);
    return row;
  };
  (matchNotificationBuilder as any).notifyMatchMessage = async () => {
    notified += 1;
  };
  (webSocketService as any).send = (userId: string, data: any) => {
    broadcasts.push({ userId, data });
    return true;
  };
});

afterEach(() => {
  const restore = (instance: object) => {
    if (Object.getPrototypeOf(instance) === Object.prototype) return;
    for (const key of Object.getOwnPropertyNames(instance)) {
      delete (instance as Record<string, unknown>)[key];
    }
  };
  restore(matchRepository);
  restore(matchMessageRepository);
  restore(tournamentRepository);
  restore(userRepository);
  restore(matchNotificationBuilder);
  restore(webSocketService);
});

describe("MatchMessageService - access", () => {
  it("rejects a user who is neither a participant nor an organizer", async () => {
    (matchRepository as any).isUserInMatch = async () => false;

    await expect(matchMessageService.list("m-1", "outsider")).rejects.toThrow(ForbiddenError);
  });

  it("lets a tournament organizer read a match they do not play", async () => {
    (matchRepository as any).isUserInMatch = async () => false;
    (tournamentRepository as any).isUserTournamentAdmin = async () => true;

    await expect(matchMessageService.list("m-1", "admin-1")).resolves.toEqual([]);
  });

  it("returns not found for an unknown match", async () => {
    (matchRepository as any).getById = async () => null;

    await expect(matchMessageService.list("nope", "p1")).rejects.toThrow(NotFoundError);
  });
});

describe("MatchMessageService - posting", () => {
  it("stores the trimmed body, broadcasts it and notifies the others", async () => {
    const message = await matchMessageService.post("m-1", "p1", "  le score est faux  ");

    expect(created[0].body).toBe("le score est faux");
    expect(created[0].kind).toBe("user");
    expect(message.author?.displayName).toBe("User-p1");
    // Participants and organizers all receive the live update
    expect(broadcasts.map((b) => b.userId).sort()).toEqual(["admin-1", "p1", "p2"]);
    expect(notified).toBe(1);
  });

  it("refuses an empty body", async () => {
    await expect(matchMessageService.post("m-1", "p1", "   ")).rejects.toThrow(BadRequestError);
  });

  it("refuses a body over the maximum length", async () => {
    await expect(matchMessageService.post("m-1", "p1", "x".repeat(1001))).rejects.toThrow(BadRequestError);
  });

  it("keeps the thread open on a match finalized less than a week ago", async () => {
    const finalizedAt = new Date();
    finalizedAt.setDate(finalizedAt.getDate() - 2);
    (matchRepository as any).getById = async () => reportedMatch({ status: "finalized", result: { finalizedAt } });

    await expect(matchMessageService.post("m-1", "p1", "hello")).resolves.toBeDefined();
  });

  it("closes the thread once the dispute window has passed", async () => {
    const finalizedAt = new Date();
    finalizedAt.setDate(finalizedAt.getDate() - 8);
    (matchRepository as any).getById = async () => reportedMatch({ status: "finalized", result: { finalizedAt } });

    await expect(matchMessageService.post("m-1", "p1", "hello")).rejects.toThrow(BadRequestError);
  });
});

describe("MatchMessageService - system messages", () => {
  it("records the i18n key and its params", async () => {
    await matchMessageService.postSystem("m-1", "matchMessages.RESULT_REVISED", {
      authorName: "User-p1",
      previousScore: "3 - 1",
      newScore: "2 - 5",
    });

    expect(created[0].kind).toBe("system");
    expect(created[0].body).toBe("matchMessages.RESULT_REVISED");
    expect(created[0].translationParams.newScore).toBe("2 - 5");
  });

  it("never lets a thread failure break the action it describes", async () => {
    (matchMessageRepository as any).create = async () => {
      throw new Error("db down");
    };

    await expect(matchMessageService.postSystem("m-1", "matchMessages.MATCH_FINALIZED", {})).resolves.toBeUndefined();
  });
});
