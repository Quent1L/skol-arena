import {
  designateMvp,
  resolveVoteConfig,
  smoothedFairPlayRate,
  VOTE_WINDOW_HOURS,
  type AdminVoteStats,
  type FairPlayTag,
  type MyVoteStats,
  type RevealedVoters,
  type TournamentVoteStats,
  type VoteStatPlayer,
} from "@skol-arena/shared/types/index";
import { voteStatsRepository } from "../repository/vote-stats.repository";
import { tournamentRepository } from "../repository/tournament.repository";
import { tournamentService } from "./tournament.service";
import { ErrorCode, ForbiddenError } from "../types/errors";
import { assignCompetitionRanks } from "./stats-ranking";

const DAY_MS = 24 * 60 * 60 * 1000;
const RANKING_LIMIT = 10;
/** The public ranking is a rolling window: the whole season belongs to its rewind. */
const RANKING_WINDOW_DAYS = 30;
const rankingSince = () => new Date(Date.now() - RANKING_WINDOW_DAYS * DAY_MS);

interface Tally {
  playerId: string;
  up: number;
  down: number;
}

const unknownPlayer = (id: string): VoteStatPlayer => ({ id, displayName: "?", shortName: "?" });

/** Share of 👍 among every fair-play vote of the tournament, the smoothing prior. */
function averageUpRate(rows: Tally[]): number {
  const up = rows.reduce((n, r) => n + r.up, 0);
  const total = rows.reduce((n, r) => n + r.up + r.down, 0);
  return total > 0 ? up / total : 1;
}

/** Smoothed fair-play ranking of the players past the vote threshold, best first. */
function rankFairPlay(rows: Tally[], minVotes: number) {
  const p = averageUpRate(rows);
  const eligible = rows
    .filter((r) => r.up + r.down >= minVotes)
    .map((r) => ({ playerId: r.playerId, votes: r.up + r.down, rate: smoothedFairPlayRate(r.up, r.down, minVotes, p) }))
    .sort((a, b) => b.rate - a.rate || b.votes - a.votes);
  return assignCompetitionRanks(eligible, (a, b) => Math.abs(a.rate - b.rate) < 1e-9 && a.votes === b.votes);
}

function tagsOf(rows: { playerId: string; tag: FairPlayTag; count: number }[], playerId: string) {
  return rows
    .filter((r) => r.playerId === playerId)
    .map(({ tag, count }) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Fair-play and MVP statistics. Public figures carry positive data only; a player's
 * 👎 are shown to themselves and to the organizers, never next to their name elsewhere.
 */
export class VoteStatsService {
  private async config(tournamentId: string) {
    return resolveVoteConfig(await tournamentRepository.getVoteConfig(tournamentId));
  }

  /**
   * MVP titles per player, derived from the ballots of validated matches. By default
   * only matches whose vote window closed count, so a ranking never moves with votes
   * still being cast; `closedOnly: false` takes them all (a finished season).
   */
  async mvpTitles(tournamentId: string, closedOnly = true): Promise<{ playerId: string; titles: number }[]> {
    const config = await this.config(tournamentId);
    if (!config.mvpEnabled) return [];
    const enteredBefore = closedOnly ? new Date(Date.now() - VOTE_WINDOW_HOURS * 60 * 60 * 1000) : undefined;
    const ballots = await voteStatsRepository.mvpBallots(tournamentId, enteredBefore);
    const byMatch = new Map<string, typeof ballots>();
    for (const b of ballots) byMatch.set(b.matchId, [...(byMatch.get(b.matchId) ?? []), b]);
    const titles = new Map<string, number>();
    for (const matchBallots of byMatch.values()) {
      for (const id of designateMvp(matchBallots, config)) titles.set(id, (titles.get(id) ?? 0) + 1);
    }
    return [...titles].map(([playerId, n]) => ({ playerId, titles: n }));
  }

  async getPublicStats(tournamentId: string): Promise<TournamentVoteStats> {
    const config = await this.config(tournamentId);
    const [received, weekly, titles] = await Promise.all([
      voteStatsRepository.fairPlayReceived(tournamentId, rankingSince()),
      voteStatsRepository.fairPlayReceived(tournamentId, new Date(Date.now() - 7 * DAY_MS)),
      this.mvpTitles(tournamentId),
    ]);
    const fairPlay = rankFairPlay(received, config.fairPlayMinVotes).slice(0, RANKING_LIMIT);
    const mvp = assignCompetitionRanks(
      [...titles].sort((a, b) => b.titles - a.titles),
      (a, b) => a.titles === b.titles,
    ).slice(0, RANKING_LIMIT);
    const best = [...weekly].filter((r) => r.up > 0).sort((a, b) => b.up - a.up)[0];
    const players = await voteStatsRepository.players([
      ...fairPlay.map((e) => e.item.playerId),
      ...mvp.map((e) => e.item.playerId),
      ...(best ? [best.playerId] : []),
    ]);
    const who = (id: string) => players.get(id) ?? unknownPlayer(id);
    const total = received.reduce((n, r) => n + r.up + r.down, 0);
    return {
      fairPlayOfTheWeek: best ? { player: who(best.playerId), ups: best.up } : null,
      fairPlayRanking: fairPlay.map(({ item, rank }) => ({ player: who(item.playerId), rate: item.rate, votes: item.votes, rank })),
      mvpRanking: mvp.map(({ item, rank }) => ({ player: who(item.playerId), titles: item.titles, rank })),
      totals: { votes: total, positiveRate: total > 0 ? averageUpRate(received) : null },
    };
  }

  async getMyStats(tournamentId: string, userId: string): Promise<MyVoteStats> {
    const config = await this.config(tournamentId);
    const [received, recent, tags, cast, titles, mvpCast, teamMatches, spectated] = await Promise.all([
      voteStatsRepository.fairPlayReceived(tournamentId),
      voteStatsRepository.fairPlayReceived(tournamentId, rankingSince()),
      voteStatsRepository.downTagsReceived(tournamentId, userId),
      voteStatsRepository.fairPlayCast(tournamentId),
      this.mvpTitles(tournamentId),
      voteStatsRepository.mvpVotesCast(tournamentId, userId),
      voteStatsRepository.teamMatchesPlayed(tournamentId, userId),
      voteStatsRepository.spectatedCount(tournamentId, userId),
    ]);
    const mine = received.find((r) => r.playerId === userId) ?? { playerId: userId, up: 0, down: 0 };
    // Rate and rank mirror the public ranking's window; the 👍/👎 counts stay cumulative.
    const ranked = rankFairPlay(recent, config.fairPlayMinVotes).find((e) => e.item.playerId === userId);
    const myCast = cast.find((r) => r.playerId === userId) ?? { up: 0, down: 0 };
    const fairPlayCast = myCast.up + myCast.down;
    return {
      fairPlay: { rate: ranked?.item.rate ?? null, rank: ranked?.rank ?? null, up: mine.up, down: mine.down, tags: tagsOf(tags, userId) },
      cast: { count: fairPlayCast + mvpCast, upRate: fairPlayCast > 0 ? myCast.up / fairPlayCast : null },
      mvp: { titles: titles.find((r) => r.playerId === userId)?.titles ?? 0, teamMatches },
      spectated,
    };
  }

  // ── Admin ─────────────────────────────────────────────────────────────

  private async assertCanManage(tournamentId: string, userId: string): Promise<void> {
    if (!(await tournamentService.canManageTournament(tournamentId, userId))) {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS);
    }
  }

  async getAdminStats(tournamentId: string, userId: string): Promise<AdminVoteStats> {
    await this.assertCanManage(tournamentId, userId);
    const [downs, recent, tags, cast, log] = await Promise.all([
      voteStatsRepository.downsReceived(tournamentId),
      voteStatsRepository.downsReceived(tournamentId, new Date(Date.now() - 30 * DAY_MS)),
      voteStatsRepository.downTagsReceived(tournamentId, undefined, true),
      voteStatsRepository.fairPlayCast(tournamentId, true),
      voteStatsRepository.revealLog(tournamentId),
    ]);
    const ids = [...downs.map((r) => r.playerId), ...cast.map((r) => r.playerId), ...log.flatMap((l) => [l.targetId, l.adminId ?? ""])];
    const players = await voteStatsRepository.players([...new Set(ids.filter(Boolean))]);
    const who = (id: string) => players.get(id) ?? unknownPlayer(id);
    return {
      received: downs
        .map((r) => ({
          player: who(r.playerId),
          down: r.down,
          downLast30Days: recent.find((x) => x.playerId === r.playerId)?.down ?? 0,
          tags: tagsOf(tags, r.playerId),
        }))
        .sort((a, b) => b.downLast30Days - a.downLast30Days || b.down - a.down),
      voters: cast
        .map((r) => ({ player: who(r.playerId), cast: r.up + r.down, downRate: r.down / (r.up + r.down) }))
        .sort((a, b) => b.downRate - a.downRate || b.cast - a.cast),
      revealLog: log.map((l) => ({ admin: l.adminId ? who(l.adminId) : null, target: who(l.targetId), createdAt: l.createdAt })),
    };
  }

  /** Who voted 👎 on a player. Every call is logged and shown to the other admins. */
  async revealVoters(tournamentId: string, userId: string, targetId: string): Promise<RevealedVoters> {
    await this.assertCanManage(tournamentId, userId);
    await voteStatsRepository.logReveal(tournamentId, userId, targetId);
    const rows = await voteStatsRepository.downVotersOf(tournamentId, targetId);
    const players = await voteStatsRepository.players([...new Set(rows.map((r) => r.voterId))]);
    return rows.map((r) => ({
      voter: players.get(r.voterId) ?? unknownPlayer(r.voterId),
      matchId: r.matchId,
      tags: (r.tags ?? []) as FairPlayTag[],
      createdAt: r.createdAt,
    }));
  }
}

export const voteStatsService = new VoteStatsService();
