import {
  REWIND_MIN_MATCHES_RIVALRY,
  resolveVoteConfig,
  smoothedFairPlayRate,
  type FairPlayTag,
  type PlayerRewindPayload,
  type RewindAward,
  type RewindPlayerRef,
  type RewindVoteAwards,
  type VoteConfig,
} from "@skol-arena/shared/types/index";
import { voteStatsRepository } from "../repository/vote-stats.repository";
import { voteStatsService } from "./vote-stats.service";
import { tournamentRepository } from "../repository/tournament.repository";

type Directory = Map<string, RewindPlayerRef>;
type PlayerVotes = NonNullable<PlayerRewindPayload["votes"]>;

/** Minimum fair-play votes cast to compete for a voter award — the existing small-sample bar. */
const MIN_VOTES_CAST = REWIND_MIN_MATCHES_RIVALRY;
const PODIUM = 3;

interface Row {
  playerId: string;
  value: number;
  detail: number;
}

/** Rows best first: value, then the sample behind it, then id for a stable order. */
function ranked(rows: Row[], directory: Directory, order: "desc" | "asc" = "desc"): RewindAward[] {
  const sign = order === "desc" ? -1 : 1;
  return rows
    .filter((r) => directory.has(r.playerId))
    .sort((a, b) => sign * (a.value - b.value) || b.detail - a.detail || a.playerId.localeCompare(b.playerId))
    .map((r) => ({ player: directory.get(r.playerId)!, value: r.value, detail: r.detail }));
}

const first = (rows: Row[], directory: Directory, order?: "desc" | "asc") => ranked(rows, directory, order)[0] ?? null;
const pct = (n: number) => Math.round(n * 100);

interface VoteData {
  received: { playerId: string; up: number; down: number }[];
  cast: { playerId: string; up: number; down: number }[];
  mvpCast: { playerId: string; n: number }[];
  titles: { playerId: string; titles: number }[];
  spectated: { playerId: string; n: number }[];
  tags: { playerId: string; tag: FairPlayTag; count: number }[];
}

function fairPlayRows(data: VoteData, config: VoteConfig): Row[] {
  const up = data.received.reduce((n, r) => n + r.up, 0);
  const total = data.received.reduce((n, r) => n + r.up + r.down, 0);
  const p = total > 0 ? up / total : 1;
  return data.received
    .filter((r) => r.up + r.down >= config.fairPlayMinVotes)
    .map((r) => ({
      playerId: r.playerId,
      value: pct(smoothedFairPlayRate(r.up, r.down, config.fairPlayMinVotes, p)),
      detail: r.up + r.down,
    }));
}

function voterRows(data: VoteData) {
  const mvpCast = new Map(data.mvpCast.map((r) => [r.playerId, r.n]));
  const ids = new Set([...data.cast.map((r) => r.playerId), ...mvpCast.keys()]);
  const involved = [...ids].map((playerId) => {
    const fp = data.cast.find((r) => r.playerId === playerId);
    const n = (fp ? fp.up + fp.down : 0) + (mvpCast.get(playerId) ?? 0);
    return { playerId, value: n, detail: n };
  });
  const rated = data.cast.filter((r) => r.up + r.down >= MIN_VOTES_CAST);
  const rate = (pick: "up" | "down") =>
    rated.map((r) => ({ playerId: r.playerId, value: pct(r[pick] / (r.up + r.down)), detail: r.up + r.down }));
  return { involved, kindest: rate("up"), strictest: rate("down") };
}

function totals(data: VoteData): RewindVoteAwards["totals"] {
  const up = data.received.reduce((n, r) => n + r.up, 0);
  const fairPlay = data.received.reduce((n, r) => n + r.up + r.down, 0);
  const mvp = data.mvpCast.reduce((n, r) => n + r.n, 0);
  const byTag = new Map<FairPlayTag, number>();
  for (const r of data.tags) byTag.set(r.tag, (byTag.get(r.tag) ?? 0) + r.count);
  const topTag = [...byTag].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { votes: fairPlay + mvp, positiveRate: fairPlay > 0 ? pct(up / fairPlay) : null, topTag };
}

export function buildAwards(data: VoteData, config: VoteConfig, directory: Directory): RewindVoteAwards {
  const fairPlay = config.fairPlayEnabled ? fairPlayRows(data, config) : [];
  const podium = ranked(fairPlay, directory).slice(0, PODIUM);
  const voters = voterRows(data);
  const voterAwards = config.rewindVoterAwards;
  const count = (rows: { playerId: string; n: number }[]) =>
    rows.filter((r) => r.n > 0).map((r) => ({ playerId: r.playerId, value: r.n, detail: r.n }));
  return {
    fairPlayPrize: podium[0] ?? null,
    fairPlayPodium: podium,
    teamCarrier: first(count(data.titles.map((r) => ({ playerId: r.playerId, n: r.titles }))), directory),
    mostInvolved: voterAwards
      ? first(
          voters.involved.filter((r) => r.value > 0),
          directory,
        )
      : null,
    kindest: voterAwards ? first(voters.kindest, directory) : null,
    strictestJudge: voterAwards
      ? first(
          voters.strictest.filter((r) => r.value > 0),
          directory,
        )
      : null,
    topSupporter: first(count(data.spectated), directory),
    fairPlayWorst: config.fairPlayPublicNegativeAward ? first(fairPlay, directory, "asc") : null,
    totals: totals(data),
  };
}

function playerVotes(data: VoteData, config: VoteConfig, directory: Directory) {
  const rows = ranked(config.fairPlayEnabled ? fairPlayRows(data, config) : [], directory);
  return (playerId: string): PlayerVotes => {
    const mine = data.received.find((r) => r.playerId === playerId);
    const index = rows.findIndex((r) => r.player.playerId === playerId);
    // Competition rank: a tie shares the best position.
    const firstTied = index >= 0 ? rows.findIndex((r) => r.value === rows[index]!.value) : -1;
    return {
      fairPlayRate: index >= 0 ? rows[index]!.value : null,
      fairPlayRank: firstTied >= 0 ? firstTied + 1 : null,
      up: mine?.up ?? 0,
      down: mine?.down ?? 0,
      tags: data.tags
        .filter((r) => r.playerId === playerId)
        .map(({ tag, count }) => ({ tag, count }))
        .sort((a, b) => b.count - a.count),
      mvpTitles: data.titles.find((r) => r.playerId === playerId)?.titles ?? 0,
    };
  };
}

/**
 * The fair-play / MVP part of a season rewind, or null when the season ran no votes.
 * Public awards are positive, except the opt-in `fairPlayWorst`; the strictest judge is
 * ranked on the share of 👎 they cast, never on whom.
 */
export async function computeVoteRewind(seasonId: string, directory: Directory) {
  const config = resolveVoteConfig(await tournamentRepository.getVoteConfig(seasonId));
  if (!config.fairPlayEnabled && !config.mvpEnabled) return null;
  const [received, cast, mvpCast, titles, spectated, tags] = await Promise.all([
    voteStatsRepository.fairPlayReceived(seasonId),
    voteStatsRepository.fairPlayCast(seasonId),
    voteStatsRepository.mvpVotesCastPerVoter(seasonId),
    // The season is over: every match counts, even one entered in its last 48 hours.
    voteStatsService.mvpTitles(seasonId),
    voteStatsRepository.spectatedPerUser(seasonId),
    voteStatsRepository.downTagsReceived(seasonId),
  ]);
  const data = { received, cast, mvpCast, titles, spectated, tags };
  return { awards: buildAwards(data, config, directory), forPlayer: playerVotes(data, config, directory) };
}
