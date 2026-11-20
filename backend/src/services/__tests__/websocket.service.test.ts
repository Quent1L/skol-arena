import { describe, expect, it, mock } from "bun:test";
import type { WSContext } from "hono/ws";
import { webSocketService } from "../websocket.service";

function fakeSocket() {
  return { send: mock(() => {}), readyState: 1 } as unknown as WSContext & { send: ReturnType<typeof mock> };
}

describe("webSocketService tournament subscriptions", () => {
  it("keeps a user's other connections subscribed when one closes", () => {
    const tournamentId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const phone = fakeSocket();
    const desktop = fakeSocket();
    webSocketService.handleConnection(phone, userId);
    webSocketService.handleConnection(desktop, userId);
    webSocketService.subscribeToTournament(tournamentId, phone);
    webSocketService.subscribeToTournament(tournamentId, desktop);

    webSocketService.handleClose(phone, userId);
    webSocketService.broadcastToTournament(tournamentId, { event: "leaderboard_updated" });

    expect(phone.send).not.toHaveBeenCalled();
    expect(desktop.send).toHaveBeenCalledTimes(1);
    expect(webSocketService.isSubscribedToTournament(tournamentId, userId)).toBe(true);
  });

  it("unsubscribes only the connection that asked", () => {
    const tournamentId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const tabA = fakeSocket();
    const tabB = fakeSocket();
    webSocketService.handleConnection(tabA, userId);
    webSocketService.handleConnection(tabB, userId);
    webSocketService.subscribeToTournament(tournamentId, tabA);
    webSocketService.subscribeToTournament(tournamentId, tabB);

    webSocketService.unsubscribeFromTournament(tournamentId, tabA);
    webSocketService.broadcastToTournament(tournamentId, { event: "standings_updated" });

    expect(tabA.send).not.toHaveBeenCalled();
    expect(tabB.send).toHaveBeenCalledTimes(1);
  });

  it("forgets a user once their last subscribed connection closes", () => {
    const tournamentId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const only = fakeSocket();
    webSocketService.handleConnection(only, userId);
    webSocketService.subscribeToTournament(tournamentId, only);

    webSocketService.handleClose(only, userId);

    expect(webSocketService.isSubscribedToTournament(tournamentId, userId)).toBe(false);
  });

  it("keeps broadcasting past a socket that throws or is closing, without throwing", () => {
    const tournamentId = crypto.randomUUID();
    const broken = fakeSocket();
    broken.send.mockImplementation(() => {
      throw new Error("socket closed");
    });
    const closing = { send: mock(() => {}), readyState: 2 } as unknown as WSContext & {
      send: ReturnType<typeof mock>;
    };
    const healthy = fakeSocket();
    for (const ws of [broken, closing, healthy]) webSocketService.subscribeToTournament(tournamentId, ws);

    expect(() => webSocketService.broadcastToTournament(tournamentId, { event: "x" })).not.toThrow();
    expect(closing.send).not.toHaveBeenCalled();
    expect(healthy.send).toHaveBeenCalledTimes(1);

    webSocketService.broadcastToTournament(tournamentId, { event: "y" });
    expect(broken.send).toHaveBeenCalledTimes(1);
    expect(healthy.send).toHaveBeenCalledTimes(2);
  });
});
