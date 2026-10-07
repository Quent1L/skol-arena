import { eq } from "drizzle-orm";
import { db } from "../config/database";
import { matches } from "../db/schema";
import { playerMmrRepository } from "../repository/player-mmr.repository";
import { rankedSeasonRepository } from "../repository/ranked-season.repository";
import { tournamentRulesetService } from "./tournament-ruleset.service";
import { resolveRulesetOutcome } from "@skol-arena/shared/types/index";
import type { MatchSubmittedContext } from "@skol-arena/shared";

type TierData = { level: number; name: string; minMmr: number };

// Timezone used to derive match hour/day facts (configurable later if needed).
const APP_TIMEZONE = process.env.APP_TIMEZONE ?? "Europe/Paris";

function getTierForMmr(mmr: number, tiers: TierData[]): TierData | null {
  if (tiers.length === 0) return null;
  return [...tiers].sort((a, b) => b.level - a.level).find((t) => mmr >= t.minMmr) ?? tiers[0];
}

export interface PlayerContext {
  playerId: string;
  context: MatchSubmittedContext;
}

interface SideInfo {
  position: number;
  score: number;
  playerIds: string[];
}

/**
 * Builds the `match_submitted` context (the "facts") for each player
 * involved in a match. The rules engine is then evaluated once
 * per player.
 */
export interface MatchSubmittedContexts {
  contexts: PlayerContext[];
  /** playerId -> displayName, for message interpolation of player-ref facts. */
  displayNames: Map<string, string>;
  /** When the match was played: a badge is dated from it, live or replayed. Absent when there is no context. */
  playedAt?: Date;
}

export class RulesContextService {
  /**
   * @param historical When true, per-player facts (winStreak/lossStreak/newMmr/
   * matchCountThisSeason) are read from the `mmr_history` snapshot of THIS match
   * rather than the player's live state. Required to replay past matches during
   * badge reconciliation. Defaults to false (live, used at finalization).
   */
  async buildMatchSubmittedContexts(
    matchId: string,
    historical = false,
  ): Promise<MatchSubmittedContexts> {
    const empty: MatchSubmittedContexts = { contexts: [], displayNames: new Map() };
    const match = await db.query.matches.findFirst({
      where: eq(matches.id, matchId),
      with: {
        tournament: true,
        sides: { with: { entry: { with: { players: { with: { player: true } } } } } },
      },
    });
    if (!match || match.sides.length < 2) return empty;

    const displayNames = new Map<string, string>();
    for (const side of match.sides) {
      for (const p of side.entry.players) {
        if (p.player) displayNames.set(p.playerId, p.player.displayName);
      }
    }

    const tournamentId = match.tournamentId;
    const sides = this.extractSides(match.sides);
    const sideA = sides.find((s) => s.position === 1);
    const sideB = sides.find((s) => s.position === 2);
    if (!sideA || !sideB) return empty;

    const winnerSide = match.winnerSide; // 'A' | 'B' | null
    const { winnerSideInfo, loserSideInfo } = this.resolveWinnerLoser(sideA, sideB, winnerSide);
    // Whole line-ups, never a single representative: on a team match, picking the
    // first player of a side would depend on entry insertion order.
    const winnerIds = winnerSide ? winnerSideInfo.playerIds : [];
    const loserIds = winnerSide ? loserSideInfo.playerIds : [];
    const scoreWinner = Math.max(sideA.score, sideB.score);
    const scoreLoser = Math.min(sideA.score, sideB.score);
    const matchScore = `${sideA.score}-${sideB.score}`;

    const rankedConfig = await rankedSeasonRepository.getConfigByTournamentId(tournamentId);
    const tiers = rankedConfig ? ((await rankedSeasonRepository.getRankTiers(tournamentId)) as TierData[]) : [];

    // Outcome labels come from the competition's ruleset snapshot. This is what
    // makes badge reconciliation reproducible: replaying a past match evaluates
    // the same facts it saw the first time, even if the outcome has since been
    // renamed or archived.
    const ruleset = await tournamentRulesetService.getForTournament(tournamentId);
    const outcome = resolveRulesetOutcome(ruleset, match.outcomeTypeId);
    const outcomeReasonName = match.outcomeReasonId
      ? (outcome.reasons.find((r) => r.id === match.outcomeReasonId)?.name ?? "")
      : "";

    const base = {
      winnerIds,
      loserIds,
      scoreWinner,
      scoreLoser,
      matchScore,
      // Read from the persisted match row, so reconciliation replays them unchanged.
      outcomeType: match.outcomeTypeId ?? "",
      outcomeTypeName: match.outcomeTypeId ? outcome.name : "",
      isDefaultOutcome: match.outcomeTypeId ? outcome.isDefault : false,
      outcomeReason: match.outcomeReasonId ?? "",
      outcomeReasonName,
      ...this.dateFacts(match.playedAt),
      discipline: match.tournament?.disciplineId ?? "",
      site: match.tournament?.organizationId ?? "",
    };

    const allPlayerTasks = ([sideA, sideB] as const).flatMap((side) => {
      const opponent = side === sideA ? sideB : sideA;
      return side.playerIds.map(async (playerId) => {
        const personal = await this.buildPersonalFacts(tournamentId, matchId, playerId, opponent, tiers, !!rankedConfig, historical);
        const lineUp = {
          playerId,
          teammateIds: side.playerIds.filter((id) => id !== playerId),
          opponentIds: opponent.playerIds,
          isWinner: winnerIds.includes(playerId),
        };
        return { playerId, context: { ...base, ...lineUp, ...personal } as MatchSubmittedContext };
      });
    });
    const contexts = await Promise.all(allPlayerTasks);
    return { contexts, displayNames, playedAt: match.playedAt };
  }

  private extractSides(rawSides: Array<{ position: number; score: number | null; entry: { players: { playerId: string }[] } }>): SideInfo[] {
    return rawSides.map((s) => ({
      position: s.position,
      score: s.score ?? 0,
      playerIds: s.entry.players.map((p) => p.playerId),
    }));
  }

  /** Date/time facts for the match, computed in the app timezone. */
  private dateFacts(
    playedAt: Date,
  ): { matchHour: number; matchMinuteOfDay: number; matchDayOfWeek: number; matchDate: string } {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: APP_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(playedAt);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
    const year = get("year");
    const month = get("month");
    const day = get("day");
    // 24h clock: Intl may emit "24" at midnight — normalize to 0.
    const matchHour = Number(get("hour")) % 24;
    const matchMinuteOfDay = matchHour * 60 + Number(get("minute"));
    // dayOfWeek from the local calendar date (1=Monday … 7=Sunday).
    const jsDay = new Date(`${year}-${month}-${day}T00:00:00Z`).getUTCDay(); // 0=Sunday
    const matchDayOfWeek = jsDay === 0 ? 7 : jsDay;
    return { matchHour, matchMinuteOfDay, matchDayOfWeek, matchDate: `${year}-${month}-${day}` };
  }

  private resolveWinnerLoser(sideA: SideInfo, sideB: SideInfo, winnerSide: string | null) {
    if (winnerSide === "B") return { winnerSideInfo: sideB, loserSideInfo: sideA };
    // Draw (null) falls through: caller guards the line-ups with `winnerSide ? … : []`
    return { winnerSideInfo: sideA, loserSideInfo: sideB };
  }

  private async buildPersonalFacts(
    seasonId: string,
    matchId: string,
    playerId: string,
    opponent: SideInfo,
    tiers: TierData[],
    isRanked: boolean,
    historical: boolean,
  ): Promise<
    Omit<
      MatchSubmittedContext,
      | "playerId"
      | "teammateIds"
      | "opponentIds"
      | "winnerIds"
      | "loserIds"
      | "isWinner"
      | "scoreWinner"
      | "scoreLoser"
      | "matchScore"
      | "outcomeType"
      | "outcomeTypeName"
      | "isDefaultOutcome"
      | "outcomeReason"
      | "outcomeReasonName"
      | "matchHour"
      | "matchMinuteOfDay"
      | "matchDayOfWeek"
      | "matchDate"
      | "discipline"
      | "site"
    >
  > {
    if (!isRanked) {
      return {
        mmrDelta: 0,
        newMmr: 0,
        previousMmr: 0,
        newRank: "",
        previousRank: "",
        rankChanged: false,
        rankUp: false,
        rankDown: false,
        winStreak: 0,
        lossStreak: 0,
        isPlacementMatch: false,
        matchCountThisSeason: 0,
        opponentRank: "",
      };
    }

    const history = await playerMmrRepository.getMmrHistoryForPlayerAndMatch(seasonId, playerId, matchId);
    // Live facts source: the player's current state. In historical mode we read
    // the snapshot persisted on this match's history row, so facts reflect the
    // player's state AS OF this match (needed to replay/reconcile badges).
    const mmr = historical ? null : await playerMmrRepository.getBySeasonAndPlayer(seasonId, playerId);

    const newMmr = (historical ? history?.mmrAfter : mmr?.currentMmr) ?? 0;
    const previousMmr = history?.mmrBefore ?? newMmr;
    const mmrDelta = history?.mmrDelta ?? 0;
    const winStreak = (historical ? history?.winStreakAfter : mmr?.winStreak) ?? 0;
    const lossStreak = (historical ? history?.lossStreakAfter : mmr?.lossStreak) ?? 0;
    const matchCountThisSeason = (historical ? history?.matchesPlayedAfter : mmr?.matchesPlayed) ?? 0;

    const tierBefore = getTierForMmr(previousMmr, tiers);
    const tierAfter = getTierForMmr(newMmr, tiers);
    const rankChanged = (tierBefore?.level ?? null) !== (tierAfter?.level ?? null);
    const rankUp = rankChanged && (tierAfter?.level ?? 0) > (tierBefore?.level ?? 0);
    const rankDown = rankChanged && (tierAfter?.level ?? 0) < (tierBefore?.level ?? 0);

    const opponentTier = getTierForMmr(history?.opponentAvgMmr ?? 0, tiers);

    return {
      mmrDelta,
      newMmr,
      previousMmr,
      newRank: tierAfter?.name ?? "",
      previousRank: tierBefore?.name ?? "",
      rankChanged,
      rankUp,
      rankDown,
      winStreak,
      lossStreak,
      isPlacementMatch: history?.isPlacement ?? false,
      matchCountThisSeason,
      opponentRank: opponentTier?.name ?? "",
    };
  }
}

export const rulesContextService = new RulesContextService();
