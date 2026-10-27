import { matchPlayerFactsRepository } from "../repository/match-player-facts.repository";
import { rulesContextService, type PlayerContext } from "./rules-context.service";

type Facts = Record<string, unknown>;

/**
 * Keeps the per-match facts snapshots the `matchCount` condition counts over, and
 * reads a player's season history back from them.
 */
export class RulesMatchHistoryService {
  /** Freezes one match's contexts. Deterministic facts only: `randomRoll` is drawn later. */
  async save(matchId: string, seasonId: string, playedAt: Date, contexts: PlayerContext[]): Promise<void> {
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

  /**
   * The player's facts for every finalized match of the season up to `upTo`, oldest
   * first. Matches played before snapshots existed are rebuilt from their history
   * once, then read like the others.
   */
  async loadSeason(seasonId: string, playerId: string, upTo: Date): Promise<Facts[]> {
    const missing = await matchPlayerFactsRepository.listMissingMatchIds(seasonId, playerId, upTo);
    for (const matchId of missing) {
      const { contexts, playedAt } = await rulesContextService.buildMatchSubmittedContexts(matchId, true);
      if (playedAt) await this.save(matchId, seasonId, playedAt, contexts);
    }
    return matchPlayerFactsRepository.listForPlayerSeason(seasonId, playerId, upTo);
  }
}

export const rulesMatchHistoryService = new RulesMatchHistoryService();
