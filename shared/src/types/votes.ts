import { z } from "zod";
import { SELF_AMEND_WINDOW_HOURS } from "./match";

// ============================================
// Fair-play & MVP votes
// ============================================

/**
 * Votes stay open as long as the author may still amend a result on their own:
 * the window is fixed when the result is entered (`reported_at`, not `created_at`: a
 * bracket or scheduled match is created long before it is played).
 */
export const VOTE_WINDOW_HOURS = SELF_AMEND_WINDOW_HOURS;

export function voteWindowCloseAt(enteredAt: Date): Date {
  return new Date(enteredAt.getTime() + VOTE_WINDOW_HOURS * 60 * 60 * 1000);
}

export const mvpTieRuleSchema = z.enum(["co_mvp", "none"]);
export type MvpTieRule = z.infer<typeof mvpTieRuleSchema>;

export const mvpSameTargetLimitSchema = z.enum(["none", "daily", "weekly"]);
export type MvpSameTargetLimit = z.infer<typeof mvpSameTargetLimitSchema>;

export const VOTE_DEFAULTS = {
  fairPlayEnabled: false,
  fairPlayMinVotes: 5,
  fairPlayAlertThreshold: 3,
  fairPlayPublicNegativeAward: false,
  mvpEnabled: false,
  mvpSpectatorsEnabled: true,
  mvpMinVotes: 2,
  mvpTieRule: "co_mvp" as MvpTieRule,
  mvpSameTargetLimit: "none" as MvpSameTargetLimit,
  rewindVoterAwards: true,
  promptMaxMatchAgeMinutes: 60,
};

export const voteConfigSchema = z
  .object({
    fairPlayEnabled: z.boolean(),
    fairPlayMinVotes: z.number().int().min(1).max(100),
    fairPlayAlertThreshold: z.number().int().min(1).max(100),
    fairPlayPublicNegativeAward: z.boolean(),
    mvpEnabled: z.boolean(),
    mvpSpectatorsEnabled: z.boolean(),
    mvpMinVotes: z.number().int().min(1).max(100),
    mvpTieRule: mvpTieRuleSchema,
    mvpSameTargetLimit: mvpSameTargetLimitSchema,
    rewindVoterAwards: z.boolean(),
    promptMaxMatchAgeMinutes: z
      .number()
      .int()
      .min(1)
      .max(24 * 60),
  })
  .meta({ id: "VoteConfig" });

export type VoteConfig = z.infer<typeof voteConfigSchema>;

export const voteConfigInputSchema = voteConfigSchema.partial();
export type VoteConfigInput = z.infer<typeof voteConfigInputSchema>;

export function resolveVoteConfig(config?: Partial<VoteConfig> | null): VoteConfig {
  const defined = Object.fromEntries(Object.entries(config ?? {}).filter(([, v]) => v !== undefined && v !== null));
  return { ...VOTE_DEFAULTS, ...defined };
}

// ============================================
// Inputs
// ============================================

export const FAIR_PLAY_TAGS = ["abusive_dispute", "bad_faith", "attitude", "lateness", "other"] as const;

export const fairPlayTagSchema = z.enum(FAIR_PLAY_TAGS);
export type FairPlayTag = z.infer<typeof fairPlayTagSchema>;

export const fairPlayVoteValueSchema = z.enum(["up", "down"]);
export type FairPlayVoteValue = z.infer<typeof fairPlayVoteValueSchema>;

export const castFairPlayVoteSchema = z
  .object({
    value: fairPlayVoteValueSchema,
    tags: z.array(fairPlayTagSchema).max(FAIR_PLAY_TAGS.length).optional(),
  })
  .refine((v) => v.value === "down" || !v.tags?.length, {
    message: "Tags only apply to a negative vote",
    path: ["tags"],
  });
export type CastFairPlayVoteInput = z.infer<typeof castFairPlayVoteSchema>;

export const castMvpVoteSchema = z.object({ targetId: z.uuid() });
export type CastMvpVoteInput = z.infer<typeof castMvpVoteSchema>;

export const votePromptOutcomeSchema = z.enum(["voted", "skipped", "dismissed", "expired"]);
export type VotePromptOutcome = z.infer<typeof votePromptOutcomeSchema>;

export const recordVotePromptSchema = z.object({ outcome: votePromptOutcomeSchema });

// ============================================
// Responses
// ============================================

export const voterRoleSchema = z.enum(["player", "spectator", "member", "none"]);
export type VoterRole = z.infer<typeof voterRoleSchema>;

export const myFairPlayVoteSchema = z.object({
  targetId: z.string(),
  value: fairPlayVoteValueSchema,
  tags: z.array(fairPlayTagSchema),
});
export type MyFairPlayVote = z.infer<typeof myFairPlayVoteSchema>;

/** What a user may see of a match's votes: their own, plus the public aggregates. */
export const matchVotesSchema = z
  .object({
    matchId: z.string(),
    closesAt: z.date().nullable(),
    isOpen: z.boolean(),
    role: voterRoleSchema,
    fairPlay: z
      .object({
        /** Opponents the user may rate — empty for anyone but a match player. */
        opponentIds: z.array(z.string()),
        myVotes: z.array(myFairPlayVoteSchema),
      })
      .nullable(),
    mvp: z
      .object({
        spectatorsEnabled: z.boolean(),
        candidateIds: z.array(z.string()),
        myVote: z.string().nullable(),
        /** Most voted player(s) right now; final once the window closes, as votes freeze. */
        mvpPlayerIds: z.array(z.string()),
        spectatorCount: z.number().int(),
        /** Targets the same-target limit blocks for this voter right now. */
        blockedTargetIds: z.array(z.string()),
      })
      .nullable(),
  })
  .meta({ id: "MatchVotes" });
export type MatchVotes = z.infer<typeof matchVotesSchema>;

export const votePromptPlayerSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  shortName: z.string().nullish(),
});

/** Everything the two-step vote toast needs, for one match and one player. */
export const votePromptSchema = z
  .object({
    matchId: z.string(),
    tournamentId: z.string(),
    /** Past this, the prompt is stale and must not show: the match is too old to recall. */
    expiresAt: z.date(),
    sides: z.array(z.object({ position: z.number().int(), players: z.array(votePromptPlayerSchema) })),
    /** Other players the user may pick as MVP; empty when MVP is off or not eligible. */
    mvpCandidateIds: z.array(z.string()),
    /** Opponents the user may give a 👍; empty when fair-play is off. */
    fairPlayTargetIds: z.array(z.string()),
  })
  .meta({ id: "VotePrompt" });
export type VotePrompt = z.infer<typeof votePromptSchema>;

/**
 * WebSocket `vote_stats_updated`, to everyone viewing the tournament: its vote rankings
 * may have moved. Carries nothing else — the page refetches the public stats.
 */
export interface VoteStatsUpdatedPayload {
  tournamentId: string;
}

/** WebSocket `match_votes_updated`: the match's MVP now. Public — never the votes. */
export interface MatchVotesUpdatedPayload {
  matchId: string;
  mvpPlayerIds: string[];
}

// ============================================
// Rules
// ============================================

/** MVP votes need at least one team of two or more: never in a 1v1. */
export function isMvpEligible(sideSizes: number[]): boolean {
  return sideSizes.some((size) => size >= 2);
}

export interface MvpBallot {
  targetId: string;
  voterRole: "player" | "spectator";
}

/**
 * The MVP(s) of a match: the most voted players, provided they reach the minimum
 * and at least one of their votes comes from a match player — spectators alone
 * cannot impose an MVP. A tie gives co-MVPs or nobody, depending on the rule.
 */
export function designateMvp(ballots: MvpBallot[], config: Pick<VoteConfig, "mvpMinVotes" | "mvpTieRule">): string[] {
  const tally = new Map<string, { votes: number; fromPlayer: boolean }>();
  for (const b of ballots) {
    const t = tally.get(b.targetId) ?? { votes: 0, fromPlayer: false };
    t.votes += 1;
    t.fromPlayer ||= b.voterRole === "player";
    tally.set(b.targetId, t);
  }
  const valid = [...tally].filter(([, t]) => t.fromPlayer && t.votes >= config.mvpMinVotes);
  const top = Math.max(0, ...valid.map(([, t]) => t.votes));
  const leaders = valid
    .filter(([, t]) => t.votes === top)
    .map(([id]) => id)
    .sort((a, b) => (a < b ? -1 : Number(a > b))); // code-unit order: locale-independent
  if (leaders.length > 1 && config.mvpTieRule === "none") return [];
  return leaders;
}

// ============================================
// Stats
// ============================================

export const voteStatPlayerSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  shortName: z.string(),
});
export type VoteStatPlayer = z.infer<typeof voteStatPlayerSchema>;

export const tagCountSchema = z.object({ tag: fairPlayTagSchema, count: z.number().int() });

/** Public vote stats of a tournament: positive data only, never a name next to a 👎. */
export const tournamentVoteStatsSchema = z
  .object({
    /** Every player tied on the most 👍 of the last 7 days. */
    fairPlayOfTheWeek: z.object({ players: z.array(voteStatPlayerSchema), ups: z.number().int() }).nullable(),
    /** Every player tied on the most MVP titles of the last 7 days. */
    mvpOfTheWeek: z.object({ players: z.array(voteStatPlayerSchema), titles: z.number().int() }).nullable(),
    fairPlayRanking: z.array(
      z.object({ player: voteStatPlayerSchema, rate: z.number(), votes: z.number().int(), rank: z.number().int() }),
    ),
    mvpRanking: z.array(z.object({ player: voteStatPlayerSchema, titles: z.number().int(), rank: z.number().int() })),
    totals: z.object({ votes: z.number().int(), positiveRate: z.number().nullable() }),
  })
  .meta({ id: "TournamentVoteStats" });
export type TournamentVoteStats = z.infer<typeof tournamentVoteStatsSchema>;

/** A player's own vote stats, shown to them alone. */
export const myVoteStatsSchema = z
  .object({
    fairPlay: z.object({
      /** Smoothed rate, null below the vote threshold. */
      rate: z.number().nullable(),
      rank: z.number().int().nullable(),
      up: z.number().int(),
      down: z.number().int(),
      tags: z.array(tagCountSchema),
    }),
    cast: z.object({ count: z.number().int(), upRate: z.number().nullable() }),
    mvp: z.object({ titles: z.number().int(), teamMatches: z.number().int() }),
    spectated: z.number().int(),
  })
  .meta({ id: "MyVoteStats" });
export type MyVoteStats = z.infer<typeof myVoteStatsSchema>;

/** The organizers' view: 👎 per player with tags, voters hidden until revealed. */
export const adminVoteStatsSchema = z
  .object({
    received: z.array(
      z.object({
        player: voteStatPlayerSchema,
        down: z.number().int(),
        downLast30Days: z.number().int(),
        tags: z.array(tagCountSchema),
      }),
    ),
    voters: z.array(z.object({ player: voteStatPlayerSchema, cast: z.number().int(), downRate: z.number() })),
    revealLog: z.array(
      z.object({ admin: voteStatPlayerSchema.nullable(), target: voteStatPlayerSchema, createdAt: z.date() }),
    ),
  })
  .meta({ id: "AdminVoteStats" });
export type AdminVoteStats = z.infer<typeof adminVoteStatsSchema>;

export const revealedVotersSchema = z
  .array(
    z.object({
      voter: voteStatPlayerSchema,
      matchId: z.string(),
      tags: z.array(fairPlayTagSchema),
      createdAt: z.date(),
    }),
  )
  .meta({ id: "RevealedVoters" });
export type RevealedVoters = z.infer<typeof revealedVotersSchema>;
