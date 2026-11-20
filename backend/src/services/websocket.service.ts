import type { WSContext } from "hono/ws";
import { logger } from "../utils/logger";

type WS = WSContext;

export class WebSocketService {
  private static instance: WebSocketService;
  // Map userId -> Set of WebSockets (to support multiple tabs/devices)
  private readonly connections: Map<string, Set<WS>> = new Map();
  // Map tournamentId -> Set of WebSockets. Per connection, not per user: a user's other
  // tabs and devices keep their own subscriptions when one of them leaves or closes.
  private readonly tournamentSubscriptions: Map<string, Set<WS>> = new Map();

  private constructor() {}

  public static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  public handleConnection(ws: WS, userId: string) {
    if (!this.connections.has(userId)) {
      this.connections.set(userId, new Set());
    }
    this.connections.get(userId)!.add(ws);
    logger.debug(`User ${userId} connected via WebSocket`);
  }

  /** `ws` must be the same object passed to handleConnection. */
  public handleClose(ws: WS, userId: string) {
    const userConns = this.connections.get(userId);
    if (userConns) {
      userConns.delete(ws);
      if (userConns.size === 0) {
        this.connections.delete(userId);
      }
    }
    for (const tournamentId of this.tournamentSubscriptions.keys()) {
      this.unsubscribeFromTournament(tournamentId, ws);
    }
    logger.debug(`User ${userId} disconnected`);
  }

  public subscribeToTournament(tournamentId: string, ws: WS): void {
    if (!this.tournamentSubscriptions.has(tournamentId)) {
      this.tournamentSubscriptions.set(tournamentId, new Set());
    }
    this.tournamentSubscriptions.get(tournamentId)!.add(ws);
  }

  /** Whether any of the user's connections follows the tournament. */
  public isSubscribedToTournament(tournamentId: string, userId: string): boolean {
    const subs = this.tournamentSubscriptions.get(tournamentId);
    const userConns = this.connections.get(userId);
    if (!subs || !userConns) return false;
    return [...userConns].some((ws) => subs.has(ws));
  }

  public unsubscribeFromTournament(tournamentId: string, ws: WS): void {
    const subs = this.tournamentSubscriptions.get(tournamentId);
    if (subs) {
      subs.delete(ws);
      if (subs.size === 0) {
        this.tournamentSubscriptions.delete(tournamentId);
      }
    }
  }

  public broadcastToTournament(tournamentId: string, data: unknown): void {
    const subs = this.tournamentSubscriptions.get(tournamentId);
    if (!subs) return;
    const message = JSON.stringify(data);
    // One closing socket must not cut the others off nor throw into the caller.
    for (const ws of subs) {
      if (ws.readyState !== undefined && ws.readyState !== 1) {
        this.unsubscribeFromTournament(tournamentId, ws);
        continue;
      }
      try {
        ws.send(message);
      } catch (err) {
        logger.error({ err, tournamentId }, "[WS] Failed to broadcast to a tournament subscriber");
        this.unsubscribeFromTournament(tournamentId, ws);
      }
    }
  }

  public send(userId: string, data: unknown) {
    const userConns = this.connections.get(userId);
    logger.debug(`[WS] Attempting to send to user ${userId}, connections: ${userConns?.size || 0}`);

    if (!userConns) {
      logger.warn(`[WS] No connections found for user ${userId}`);
      return false;
    }

    const message = JSON.stringify(data);
    logger.debug({ message }, `[WS] Sending message to user ${userId}:`);

    for (const ws of userConns) {
      this.sendToConnection(userId, ws, message, userConns);
    }
    return true;
  }

  private sendToConnection(userId: string, ws: WS, message: string, userConns: Set<WS>) {
    if (ws.readyState === 1) {
      ws.send(message);
      logger.debug(`[WS] Message sent successfully to user ${userId}`);
      return;
    }
    if (ws.readyState === undefined) {
      try {
        ws.send(message);
        logger.debug(`[WS] Message sent successfully to user ${userId} (no readyState)`);
      } catch (e) {
        logger.error({ err: e }, `[WS] Failed to send to user ${userId}`);
        this.dropConnection(userId, ws, userConns);
      }
      return;
    }
    logger.warn(`[WS] WebSocket not ready for user ${userId}, readyState: ${ws.readyState}`);
    this.dropConnection(userId, ws, userConns);
  }

  private dropConnection(userId: string, ws: WS, userConns: Set<WS>) {
    userConns.delete(ws);
    if (userConns.size === 0) this.connections.delete(userId);
  }
}

export const webSocketService = WebSocketService.getInstance();
