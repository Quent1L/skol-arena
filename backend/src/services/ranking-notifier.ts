import type { TournamentMode } from "@skol-arena/shared/types/index";
import { webSocketService } from "./websocket.service";

/**
 * Tells every page open on a competition that its ranking changed without a match:
 * a player left, came back or was removed, or an organizer cleared the cache.
 * A ranked season reuses `leaderboard_updated`, which its page already refreshes on;
 * a championship gets `standings_updated`. A bracket has no ranking to refresh.
 */
export function notifyRankingChanged(tournament: { id: string; mode: TournamentMode }): void {
  if (tournament.mode === "ranked") {
    webSocketService.broadcastToTournament(tournament.id, {
      event: "leaderboard_updated",
      data: { seasonId: tournament.id },
    });
  } else if (tournament.mode === "championship") {
    webSocketService.broadcastToTournament(tournament.id, {
      event: "standings_updated",
      data: { tournamentId: tournament.id },
    });
  }
}
