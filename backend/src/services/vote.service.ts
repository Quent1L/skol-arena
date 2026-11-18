import {
  designateMvp,
  isMvpEligible,
  resolveVoteConfig,
  voteWindowCloseAt,
  VOTE_WINDOW_HOURS,
  type CastFairPlayVoteInput,
  type MatchVotes,
  type VoteConfig,
  type VotePrompt,
  type VotePromptOutcome,
  type VoterRole,
} from "@skol-arena/shared/types/index";
import { voteRepository, type VoteMatch, type VoteMatchPlayer } from "../repository/vote.repository";
import { tournamentRepository } from "../repository/tournament.repository";
import { matchPermissionValidator } from "./validators/match-permission.validator";
import { notificationService } from "./notification.service";
import { ConflictError, ErrorCode, ForbiddenError, NotFoundError } from "../types/errors";
import { logger } from "../utils/logger";

const DAY_MS = 24 * 60 * 60 * 1000;
const ALERT_WINDOW_DAYS = 30;
const PROMPT_IGNORED_LIMIT = 3;
const PROMPT_SNOOZE_DAYS = 7;

interface VoteContext {
  match: VoteMatch;
  config: VoteConfig;
  role: VoterRole;
  me: VoteMatchPlayer | undefined;
  closesAt: Date;
  isOpen: boolean;
  mvpEligible: boolean;
}

/**
 * Fair-play and MVP votes. Never touches MMR or standings. A player only ever gets
 * their own votes and the public aggregates back — never who voted what on them.
 *
 * Matches never change players once entered (`updateMatchSchema` has no side or
 * player field), so the spec's "votes of players who left the match" case cannot
 * happen; a cancellation drops every vote (`onMatchCancelled`).
 */
export class VoteService {
  private async loadContext(matchId: string, userId: string, now = new Date()): Promise<VoteContext> {
    const match = await voteRepository.getMatch(matchId);
    if (!match) throw new NotFoundError(ErrorCode.MATCH_NOT_FOUND);

    const config = resolveVoteConfig(await tournamentRepository.getVoteConfig(match.tournamentId));
    const me = match.players.find((p) => p.id === userId);
    const closesAt = voteWindowCloseAt(match.createdAt);
    const sideSizes = [1, 2].map((pos) => match.players.filter((p) => p.position === pos).length);
    return {
      match,
      config,
      me,
      role: await this.resolveRole(match, userId, !!me),
      closesAt,
      isOpen: match.status !== "cancelled" && now < closesAt,
      mvpEligible: config.mvpEnabled && isMvpEligible(sideSizes),
    };
  }

  private async resolveRole(match: VoteMatch, userId: string, isPlayer: boolean): Promise<VoterRole> {
    if (isPlayer) return "player";
    if (await voteRepository.isSpectator(match.id, userId)) return "spectator";
    if (await tournamentRepository.isActiveParticipant(match.tournamentId, userId)) return "member";
    return "none";
  }

  private opponentsOf(ctx: VoteContext): VoteMatchPlayer[] {
    if (!ctx.me) return [];
    return ctx.match.players.filter((p) => p.position !== ctx.me?.position);
  }

  // ── Read ──────────────────────────────────────────────────────────────

  async getMatchVotes(matchId: string, userId: string): Promise<MatchVotes> {
    const ctx = await this.loadContext(matchId, userId);
    const canSeeMvp =
      ctx.role !== "none" ||
      (await matchPermissionValidator.canManageMatches(ctx.match.tournamentId, userId));
    return {
      matchId,
      closesAt: ctx.closesAt,
      isOpen: ctx.isOpen,
      role: ctx.role,
      fairPlay: await this.fairPlayView(ctx, userId),
      mvp: canSeeMvp ? await this.mvpView(ctx, userId) : null,
    };
  }

  private async fairPlayView(ctx: VoteContext, userId: string): Promise<MatchVotes["fairPlay"]> {
    if (!ctx.config.fairPlayEnabled || ctx.role !== "player") return null;
    const votes = await voteRepository.listFairPlayVotesBy(ctx.match.id, userId);
    return {
      opponentIds: this.opponentsOf(ctx).map((p) => p.id),
      myVotes: votes.map((v) => ({ ...v, tags: (v.tags ?? []) as MyTags })),
    };
  }

  private async mvpView(ctx: VoteContext, userId: string): Promise<MatchVotes["mvp"]> {
    if (!ctx.mvpEligible || ctx.match.status === "cancelled") return null;
    const frozen = ctx.match.mvpPlayerIds;
    const canVote = ctx.role === "player" || ctx.role === "spectator";
    return {
      spectatorsEnabled: ctx.config.mvpSpectatorsEnabled,
      candidateIds: ctx.match.players.filter((p) => p.id !== userId).map((p) => p.id),
      myVote: canVote ? await voteRepository.getMvpVoteBy(ctx.match.id, userId) : null,
      mvpPlayerIds: frozen ?? designateMvp(await voteRepository.listMvpBallots(ctx.match.id), ctx.config),
      isFinal: frozen !== null,
      spectatorCount: await voteRepository.countSpectators(ctx.match.id),
      blockedTargetIds: canVote ? await this.blockedMvpTargets(ctx, userId) : [],
    };
  }

  private async blockedMvpTargets(ctx: VoteContext, userId: string): Promise<string[]> {
    const limit = ctx.config.mvpSameTargetLimit;
    if (limit === "none") return [];
    const since = new Date(Date.now() - (limit === "daily" ? 1 : 7) * DAY_MS);
    return await voteRepository.recentMvpTargets(ctx.match.tournamentId, userId, ctx.match.id, since);
  }

  // ── Fair-play writes ──────────────────────────────────────────────────

  private async fairPlayContext(matchId: string, userId: string): Promise<VoteContext> {
    const ctx = await this.loadContext(matchId, userId);
    if (!ctx.config.fairPlayEnabled) throw new ForbiddenError(ErrorCode.VOTING_DISABLED);
    if (ctx.role !== "player") throw new ForbiddenError(ErrorCode.VOTE_NOT_ALLOWED);
    if (!ctx.isOpen) throw new ConflictError(ErrorCode.VOTING_CLOSED);
    return ctx;
  }

  async castFairPlay(matchId: string, userId: string, targetId: string, input: CastFairPlayVoteInput) {
    const ctx = await this.fairPlayContext(matchId, userId);
    if (!this.opponentsOf(ctx).some((p) => p.id === targetId)) {
      throw new ForbiddenError(ErrorCode.VOTE_NOT_ALLOWED);
    }
    const tags = input.value === "down" && input.tags?.length ? [...new Set(input.tags)] : null;
    await voteRepository.upsertFairPlayVotes(matchId, userId, [{ targetId, value: input.value, tags }]);
    if (input.value === "down") await this.maybeAlertAdmins(ctx, targetId);
    await this.afterVote(matchId, userId);
    return await this.getMatchVotes(matchId, userId);
  }

  /** "Whole team 👍": a 👍 on every opponent. There is no 👎 counterpart, on purpose. */
  async castFairPlayTeamUp(matchId: string, userId: string) {
    const ctx = await this.fairPlayContext(matchId, userId);
    const votes = this.opponentsOf(ctx).map((p) => ({ targetId: p.id, value: "up" as const, tags: null }));
    await voteRepository.upsertFairPlayVotes(matchId, userId, votes);
    await this.afterVote(matchId, userId);
    return await this.getMatchVotes(matchId, userId);
  }

  async removeFairPlay(matchId: string, userId: string, targetId: string) {
    await this.fairPlayContext(matchId, userId);
    await voteRepository.deleteFairPlayVote(matchId, userId, targetId);
    return await this.getMatchVotes(matchId, userId);
  }

  /**
   * Warns the tournament admins the moment a player reaches the 👎 threshold over the
   * last 30 days.
   * shortcut: a vote flipped back and forth across the threshold re-sends the alert;
   * track sent alerts if admins report duplicates.
   */
  private async maybeAlertAdmins(ctx: VoteContext, targetId: string): Promise<void> {
    const since = new Date(Date.now() - ALERT_WINDOW_DAYS * DAY_MS);
    const count = await voteRepository.countDownsReceived(ctx.match.tournamentId, targetId, since);
    if (count !== ctx.config.fairPlayAlertThreshold) return;
    try {
      await this.sendAlert(ctx, targetId, count);
    } catch (err) {
      logger.error({ err, matchId: ctx.match.id, targetId }, "Failed to send fair-play alert");
    }
  }

  private async sendAlert(ctx: VoteContext, targetId: string, count: number): Promise<void> {
    const tournament = await tournamentRepository.getByIdSimple(ctx.match.tournamentId);
    const player = ctx.match.players.find((p) => p.id === targetId);
    const admins = await tournamentRepository.getAdminUserIds(ctx.match.tournamentId);
    for (const adminId of admins) {
      await notificationService.send({
        userId: adminId,
        type: "FAIR_PLAY_ALERT",
        titleKey: "notifications.FAIR_PLAY_ALERT_TITLE",
        messageKey: "notifications.FAIR_PLAY_ALERT_MESSAGE",
        translationParams: { playerName: player?.displayName ?? "", tournamentName: tournament?.name ?? "", count },
        actionUrl: `/tournaments/${ctx.match.tournamentId}/fair-play`,
        requiresAction: false,
      });
    }
  }

  // ── Spectators ────────────────────────────────────────────────────────

  async declareSpectator(matchId: string, userId: string) {
    const ctx = await this.loadContext(matchId, userId);
    if (!ctx.mvpEligible || !ctx.config.mvpSpectatorsEnabled) {
      throw new ForbiddenError(ErrorCode.VOTING_DISABLED);
    }
    if (ctx.role !== "member" && ctx.role !== "spectator") throw new ForbiddenError(ErrorCode.VOTE_NOT_ALLOWED);
    if (!ctx.isOpen) throw new ConflictError(ErrorCode.VOTING_CLOSED);
    await voteRepository.addSpectator(matchId, userId);
    return await this.getMatchVotes(matchId, userId);
  }

  async withdrawSpectator(matchId: string, userId: string) {
    const ctx = await this.loadContext(matchId, userId);
    if (!ctx.isOpen) throw new ConflictError(ErrorCode.VOTING_CLOSED);
    await voteRepository.removeSpectator(matchId, userId);
    return await this.getMatchVotes(matchId, userId);
  }

  // ── MVP writes ────────────────────────────────────────────────────────

  private async mvpContext(matchId: string, userId: string): Promise<VoteContext> {
    const ctx = await this.loadContext(matchId, userId);
    if (!ctx.mvpEligible) throw new ForbiddenError(ErrorCode.VOTING_DISABLED);
    const spectatorAllowed = ctx.role === "spectator" && ctx.config.mvpSpectatorsEnabled;
    if (ctx.role !== "player" && !spectatorAllowed) throw new ForbiddenError(ErrorCode.VOTE_NOT_ALLOWED);
    if (!ctx.isOpen) throw new ConflictError(ErrorCode.VOTING_CLOSED);
    return ctx;
  }

  async castMvp(matchId: string, userId: string, targetId: string) {
    const ctx = await this.mvpContext(matchId, userId);
    if (targetId === userId || !ctx.match.players.some((p) => p.id === targetId)) {
      throw new ForbiddenError(ErrorCode.VOTE_NOT_ALLOWED);
    }
    if ((await this.blockedMvpTargets(ctx, userId)).includes(targetId)) {
      throw new ConflictError(ErrorCode.MVP_SAME_TARGET_LIMIT);
    }
    const role = ctx.role === "player" ? "player" : "spectator";
    await voteRepository.upsertMvpVote(matchId, userId, targetId, role);
    await this.afterVote(matchId, userId);
    return await this.getMatchVotes(matchId, userId);
  }

  async removeMvp(matchId: string, userId: string) {
    await this.mvpContext(matchId, userId);
    await voteRepository.deleteMvpVote(matchId, userId);
    return await this.getMatchVotes(matchId, userId);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  async onMatchCancelled(matchId: string): Promise<void> {
    await voteRepository.deleteAllForMatch(matchId);
  }

  /** Freezes the MVP of every match whose window closed. Run by the hourly job. */
  async freezeClosedMatches(now = new Date()): Promise<number> {
    const closedBefore = new Date(now.getTime() - VOTE_WINDOW_HOURS * 60 * 60 * 1000);
    const due = await voteRepository.listMatchesToFreeze(closedBefore);
    const configs = new Map<string, VoteConfig>();
    for (const { id, tournamentId } of due) {
      if (!configs.has(tournamentId)) {
        configs.set(tournamentId, resolveVoteConfig(await tournamentRepository.getVoteConfig(tournamentId)));
      }
      const ballots = await voteRepository.listMvpBallots(id);
      await voteRepository.setMvp(id, designateMvp(ballots, configs.get(tournamentId) as VoteConfig));
    }
    return due.length;
  }

  // ── Vote prompts (toasts) ─────────────────────────────────────────────

  /** A vote resets the prompt back-off and settles the prompt it came from. */
  private async afterVote(matchId: string, userId: string): Promise<void> {
    const state = await voteRepository.getPromptState(userId);
    await voteRepository.savePromptState(userId, 0, state?.snoozedUntil ?? null);
    await voteRepository.markPromptVoted(matchId, userId);
  }

  /** The toast offered to the author right after entering a match (§6.1). */
  async getPromptForMatch(matchId: string, userId: string): Promise<VotePrompt | null> {
    if (await voteRepository.hasPrompt(matchId, userId)) return null;
    return await this.buildPrompt(matchId, userId);
  }

  /** The toast offered on opening the app, for the latest match someone else entered (§6.2). */
  async getPendingPrompt(userId: string): Promise<VotePrompt | null> {
    const matchId = await voteRepository.getLatestMatchIdOf(userId);
    if (!matchId || (await voteRepository.hasPrompt(matchId, userId))) return null;
    const prompt = await this.buildPrompt(matchId, userId);
    if (!prompt) return null;
    const match = await voteRepository.getMatch(matchId);
    return match?.createdBy === userId ? null : prompt;
  }

  private async buildPrompt(matchId: string, userId: string, now = new Date()): Promise<VotePrompt | null> {
    const ctx = await this.loadContext(matchId, userId, now);
    if (ctx.role !== "player" || !ctx.isOpen || !ctx.me) return null;
    const ageMinutes = (now.getTime() - ctx.match.playedAt.getTime()) / 60000;
    if (ageMinutes > ctx.config.promptMaxMatchAgeMinutes) return null;
    if (await this.isSnoozed(userId, now)) return null;
    if (await voteRepository.hasVoted(matchId, userId)) return null;
    return await this.toPrompt(ctx, userId);
  }

  private async toPrompt(ctx: VoteContext, userId: string): Promise<VotePrompt | null> {
    const blocked = new Set(ctx.mvpEligible ? await this.blockedMvpTargets(ctx, userId) : []);
    const mvpCandidateIds = ctx.mvpEligible
      ? ctx.match.players.filter((p) => p.id !== userId && !blocked.has(p.id)).map((p) => p.id)
      : [];
    const fairPlayTargetIds = ctx.config.fairPlayEnabled ? this.opponentsOf(ctx).map((p) => p.id) : [];
    if (mvpCandidateIds.length === 0 && fairPlayTargetIds.length === 0) return null;
    const winner = ctx.match.winnerSide === "A" ? 1 : ctx.match.winnerSide === "B" ? 2 : null;
    return {
      matchId: ctx.match.id,
      tournamentId: ctx.match.tournamentId,
      myPosition: ctx.me?.position ?? 0,
      winnerPosition: winner,
      sides: [1, 2].map((position) => ({
        position,
        players: ctx.match.players.filter((p) => p.position === position).map(({ position: _, ...p }) => p),
      })),
      mvpCandidateIds,
      fairPlayTargetIds,
    };
  }

  private async isSnoozed(userId: string, now: Date): Promise<boolean> {
    const state = await voteRepository.getPromptState(userId);
    return !!state?.snoozedUntil && state.snoozedUntil > now;
  }

  /**
   * Records how a shown prompt ended. Only the first outcome sticks (a prompt shows
   * once per match), except `voted`, which may settle it later. Three ignored prompts
   * in a row snooze them for a week.
   */
  async recordPrompt(matchId: string, userId: string, outcome: VotePromptOutcome): Promise<void> {
    const ctx = await this.loadContext(matchId, userId);
    if (ctx.role !== "player") throw new ForbiddenError(ErrorCode.VOTE_NOT_ALLOWED);
    const inserted = await voteRepository.recordPrompt(matchId, userId, outcome);
    if (!inserted) {
      if (outcome === "voted") await voteRepository.markPromptVoted(matchId, userId);
      return;
    }
    if (outcome !== "dismissed" && outcome !== "expired") return;
    await this.bumpIgnored(userId);
  }

  private async bumpIgnored(userId: string): Promise<void> {
    const state = await voteRepository.getPromptState(userId);
    const ignored = (state?.consecutiveIgnored ?? 0) + 1;
    if (ignored >= PROMPT_IGNORED_LIMIT) {
      await voteRepository.savePromptState(userId, 0, new Date(Date.now() + PROMPT_SNOOZE_DAYS * DAY_MS));
      return;
    }
    await voteRepository.savePromptState(userId, ignored, state?.snoozedUntil ?? null);
  }
}

type MyTags = NonNullable<MatchVotes["fairPlay"]>["myVotes"][number]["tags"];

export const voteService = new VoteService();
