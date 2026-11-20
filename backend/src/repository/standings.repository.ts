import { eq, and, inArray, notInArray } from "drizzle-orm";
import { db } from "../config/database";
import {
  tournaments,
  tournamentEntries,
  teams,
  matches,
  matchSides,
  matchPlayerPoints,
  computedData,
} from "../db/schema";
import { type MatchStatus, type StandingsResult } from "@skol-arena/shared";
import { TOURNAMENT_CONFIGS_WITH } from "./tournament-config.columns";

/**
 * `computed_data` rows that a cache flush must leave alone.
 *
 * The table mixes caches with one piece of durable state: `mmr:engine-version`
 * records which engine a season was last replayed on. Dropping it makes the boot
 * catch-up re-queue a full replay of every season, which used to be rare enough
 * to go unnoticed and stops being rare once a ruleset propagation flushes here.
 */
const PRESERVED_COMPUTED_KEYS = ["mmr:engine-version"];

export type PlayerPointRow = {
  matchId: string;
  playerId: string;
  pointsAwarded: number;
  countsForRanking: boolean;
};

export class StandingsRepository {
  async getTournamentWithScoring(tournamentId: string) {
    return await db.query.tournaments.findFirst({
      where: eq(tournaments.id, tournamentId),
      columns: {
        id: true,
        mode: true,
        teamMode: true,
        allowDraw: true,
        scoreEnabled: true,
      },
      with: TOURNAMENT_CONFIGS_WITH,
    });
  }

  async getTournamentTeams(tournamentId: string) {
    return await db.query.teams.findMany({
      where: eq(teams.tournamentId, tournamentId),
    });
  }

  async getTournamentEntries(tournamentId: string) {
    return await db.query.tournamentEntries.findMany({
      where: eq(tournamentEntries.tournamentId, tournamentId),
      with: {
        team: true,
        players: {
          with: {
            player: true,
          },
        },
      },
    });
  }

  async getMatchesWithSides(tournamentId: string, includeStatuses: MatchStatus[]) {
    return await db.query.matches.findMany({
      where: and(eq(matches.tournamentId, tournamentId), inArray(matches.status, includeStatuses)),
      columns: {
        id: true,
        winnerSide: true,
        playedAt: true,
        outcomeTypeId: true,
      },
      with: {
        // No outcomeType join: its name and points come from the competition's
        // ruleset snapshot, so editing the live row cannot rewrite past tiebreakers.
        sides: {
          with: {
            entry: {
              with: {
                team: true,
                players: {
                  with: { player: true },
                },
              },
            },
          },
          orderBy: (s, { asc }) => [asc(s.position)],
        },
      },
    });
  }

  async getPlayerPointsForStandings(tournamentId: string, includeStatuses: MatchStatus[]) {
    return await db.query.matches.findMany({
      where: and(eq(matches.tournamentId, tournamentId), inArray(matches.status, includeStatuses)),
      columns: { id: true, winnerSide: true, outcomeTypeId: true },
      with: {
        playerPoints: {
          columns: {
            playerId: true,
            pointsAwarded: true,
            countsForRanking: true,
          },
        },
        sides: {
          columns: { position: true, score: true, entryId: true },
          with: {
            entry: {
              columns: { id: true },
              with: {
                players: { columns: { playerId: true } },
              },
            },
          },
        },
      },
    });
  }

  async deletePlayerPointsForTournament(tournamentId: string, includeStatuses: MatchStatus[]) {
    const matchIds = await db.query.matches.findMany({
      where: and(eq(matches.tournamentId, tournamentId), inArray(matches.status, includeStatuses)),
      columns: { id: true },
    });

    if (matchIds.length === 0) return;

    await db.delete(matchPlayerPoints).where(
      inArray(
        matchPlayerPoints.matchId,
        matchIds.map((m) => m.id),
      ),
    );
  }

  async insertPlayerPoints(rows: PlayerPointRow[]) {
    if (rows.length === 0) return;
    await db.insert(matchPlayerPoints).values(rows);
  }

  async getMatchesForStandings(tournamentId: string, includeStatuses: MatchStatus[]) {
    return await db.query.matches.findMany({
      where: and(eq(matches.tournamentId, tournamentId), inArray(matches.status, includeStatuses)),
      columns: {
        id: true,
        status: true,
        winnerSide: true,
        playedAt: true,
      },
    });
  }

  async getMatchSides(matchIds: string[]) {
    if (matchIds.length === 0) return [];

    return await db.query.matchSides.findMany({
      where: inArray(matchSides.matchId, matchIds),
      with: {
        entry: {
          with: {
            team: true,
            players: {
              with: {
                player: true,
              },
            },
          },
        },
      },
      orderBy: (matchSides, { asc }) => [asc(matchSides.matchId), asc(matchSides.position)],
    });
  }

  // ── Computed data cache ──────────────────────────────────────────────

  async getComputedData(tournamentId: string, key: string): Promise<StandingsResult | null> {
    const row = await db.query.computedData.findFirst({
      where: and(eq(computedData.tournamentId, tournamentId), eq(computedData.key, key)),
    });
    if (!row) return null;
    return row.data as StandingsResult;
  }

  async setComputedData(tournamentId: string, key: string, data: StandingsResult): Promise<void> {
    await db
      .insert(computedData)
      .values({ tournamentId, key, data, computedAt: new Date() })
      .onConflictDoUpdate({
        target: [computedData.tournamentId, computedData.key],
        set: { data, computedAt: new Date() },
      });
  }

  async deleteComputedData(tournamentId: string): Promise<void> {
    await db
      .delete(computedData)
      .where(and(eq(computedData.tournamentId, tournamentId), notInArray(computedData.key, PRESERVED_COMPUTED_KEYS)));
  }

  async deleteComputedDataMany(tournamentIds: string[]): Promise<void> {
    if (tournamentIds.length === 0) return;
    await db
      .delete(computedData)
      .where(
        and(inArray(computedData.tournamentId, tournamentIds), notInArray(computedData.key, PRESERVED_COMPUTED_KEYS)),
      );
  }
}

export const standingsRepository = new StandingsRepository();
