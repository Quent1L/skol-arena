import { matchPlayerFactsRepository } from "../repository/match-player-facts.repository";
import { rulesContextService } from "./rules-context.service";
import { logger } from "../utils/logger";

type Facts = Record<string, unknown>;

/**
 * Keeps the per-match facts snapshots the `matchCount` condition counts over, and
 * reads a player's season history back from them.
 */
export class RulesMatchHistoryService {
  /**
   * Freezes one match's facts as they stood at that match. Always historical: the
   * players' live state may already be past it. Deterministic facts only:
   * `randomRoll` is drawn later.
   */
  async refreshMatch(matchId: string, seasonId: string): Promise<void> {
    const { contexts, playedAt } = await rulesContextService.buildMatchSubmittedContexts(matchId, true);
    if (!playedAt) return;
    await matchPlayerFactsRepository.upsertMany(
      contexts.map(({ playerId, context }) => ({
        matchId,
        playerId,
        seasonId,
        playedAt,
        facts: context as unknown as Facts,
      })),
    );
  }

  /** Rewrites the players' snapshots after their history moved, from `from` on or for the whole season. */
  async refreshPlayers(seasonId: string, playerIds: string[], from?: Date): Promise<void> {
    const rows = await matchPlayerFactsRepository.listPlayersMatches(seasonId, playerIds, from);
    await this.refreshMatches(rows.map((r) => r.matchId), seasonId);
  }

  /**
   * Rewrites what a backdated match invalidated: the players' matches played since.
   * Returns the players who had any, the only ones whose history actually moved.
   */
  async refreshAfterBackdatedMatch(
    seasonId: string,
    matchId: string,
    playerIds: string[],
    playedAt: Date,
  ): Promise<string[]> {
    const rows = await matchPlayerFactsRepository.listPlayersMatches(seasonId, playerIds, playedAt);
    const later = rows.filter((r) => r.matchId !== matchId);
    await this.refreshMatches(later.map((r) => r.matchId), seasonId);
    return [...new Set(later.map((r) => r.playerId))];
  }

  /** One match at a time, each failure costing that match only until the next refresh. */
  private async refreshMatches(matchIds: string[], seasonId: string): Promise<void> {
    for (const matchId of new Set(matchIds)) {
      await this.refreshMatch(matchId, seasonId).catch((err) =>
        logger.error({ err, matchId, seasonId }, "[Rules] refreshing match facts failed"),
      );
    }
  }

  /**
   * The player's facts for every finalized match of the season up to `upTo`, oldest
   * first. Matches played before snapshots existed are rebuilt from their history
   * once, then read like the others.
   */
  async loadSeason(seasonId: string, playerId: string, upTo: Date): Promise<Facts[]> {
    const missing = await matchPlayerFactsRepository.listMissingMatchIds(seasonId, playerId, upTo);
    for (const matchId of missing) await this.refreshMatch(matchId, seasonId);
    return matchPlayerFactsRepository.listForPlayerSeason(seasonId, playerId, upTo);
  }
}

export const rulesMatchHistoryService = new RulesMatchHistoryService();
