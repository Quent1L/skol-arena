import { z } from "zod";
import { mmrChartPointSchema } from "./ranked";
import { clientPlayerBadgeSchema } from "./rules-engine";
import { playerRelationStatSchema } from "./player";
import { fairPlayTagSchema, tagCountSchema } from "./votes";

// ============================================
// Season Rewind — end-of-season recap
// ============================================

/**
 * Format version of the payloads this build produces.
 *
 * A rewind is a souvenir, not a report: the deck a player watched in 2026 must
 * still be that same deck in 2030. So a stored rewind is frozen at the version
 * that produced it — the generator refuses to touch a season whose stored
 * version is not this one, and the client renders only the cards that version
 * knew about (see the `since` field on the card registry).
 *
 * Bump this **only when the payload shape changes** — a new field, a card that
 * needs data the old payloads do not carry. Bumping is irreversible in practice:
 * every rewind already stored stops being regenerated from that moment on, so
 * any fix to the numbers has to ship *before* the bump that freezes them.
 * Changing how a figure is computed, without changing the shape, is not a
 * version bump: it is a fix that existing rewinds should receive.
 */
export const REWIND_VERSION = 1;

/**
 * How many points a stored MMR journey keeps. The curve is a 160px sparkline
 * with no visible markers: past a couple hundred points the extra resolution is
 * not rendered, it is only stored and shipped. A season regular can play a
 * thousand ranked matches, so the raw series is downsampled on write.
 */
export const REWIND_MAX_CHART_POINTS = 200;

/** How long a freshly generated rewind stays promoted on the home page. */
export const REWIND_PROMO_DAYS = 14;

/** Minimum matches required to be eligible for the corresponding award. */
export const REWIND_MIN_MATCHES_SNIPER = 20;
export const REWIND_MIN_MATCHES_DUO = 10;
export const REWIND_MIN_MATCHES_RIVALRY = 5;
export const REWIND_MIN_MATCHES_NEMESIS = 5;

/**
 * Minimum matches to enter the pool a rate percentile is measured against. Rate
 * metrics are meaningless at one match — a single win is a 100% win rate — and
 * one such player shifts every regular down a band. The sniper threshold is
 * reused so "top X% on win rate" and "best win rate of the season" answer to the
 * same population.
 */
export const REWIND_MIN_MATCHES_PERCENTILE = REWIND_MIN_MATCHES_SNIPER;

/** A rewind covers a single season today; 'year' is reserved for cross-season recaps. */
export type RewindScope = "season" | "year";

export const rewindPlayerRefSchema = z
  .object({
    playerId: z.string(),
    displayName: z.string(),
    shortName: z.string(),
  })
  .meta({ id: "RewindPlayerRef" });

export type RewindPlayerRef = z.infer<typeof rewindPlayerRefSchema>;

/** The rank tier a figure lands in, carried with everything a badge needs to draw itself. */
export const rewindTierRefSchema = z
  .object({
    name: z.string(),
    /** i18n key of a default-ladder tier; the client renders it in its own locale. */
    nameKey: z.string().nullable(),
    level: z.number().int(),
    /** Per-season override; the client falls back on its own icon table by level. */
    iconClass: z.string().nullable(),
  })
  .meta({ id: "RewindTierRef" });

export type RewindTierRef = z.infer<typeof rewindTierRefSchema>;

/**
 * How many players stood on each side of a match. An MMR gap only means
 * something next to the format it was taken in: in 2v2 the "opposition" is a
 * team average, not a single player.
 */
export const rewindMatchFormatSchema = z
  .object({
    teamSize: z.number().int(),
    opponentTeamSize: z.number().int(),
  })
  .meta({ id: "RewindMatchFormat" });

export type RewindMatchFormat = z.infer<typeof rewindMatchFormatSchema>;

// ============================================
// Global awards
// ============================================

/**
 * Every award the season hands out. Used as a discriminator so a player payload
 * can flag which ones it won without duplicating the award data.
 */
export const rewindAwardKeySchema = z.enum([
  "king",
  "peakMmr",
  "progression",
  "sniper",
  "biggestUpset",
  "giantKiller",
  "leaderHunter",
  "rivalry",
  "nemesis",
  "marathon",
  "topOneKing",
  "topThreeKing",
  "topFiveKing",
  "longestStreak",
  "duo",
  "bestPartner",
  "fairPlayPrize",
  "teamCarrier",
  "mostInvolved",
  "kindest",
  "strictestJudge",
  "topSupporter",
  "fairPlayWorst",
]);

export type RewindAwardKey = z.infer<typeof rewindAwardKeySchema>;

export const rewindAwardSchema = z
  .object({
    player: rewindPlayerRefSchema,
    /** The metric the award ranks on — meaning depends on the award. */
    value: z.number(),
    /** Contextual figure shown next to the value (usually matches played). */
    detail: z.number().nullish(),
  })
  .meta({ id: "RewindAward" });

export type RewindAward = z.infer<typeof rewindAwardSchema>;

/** An award earned in a single identified match rather than over a cumulative total. */
export const rewindDatedAwardSchema = rewindAwardSchema
  .extend({
    matchId: z.string(),
    playedAt: z.date(),
    opponent: rewindPlayerRefSchema.nullish(),
    /** Set on awards where the format changes how the value reads, null elsewhere. */
    format: rewindMatchFormatSchema.nullish(),
  })
  .meta({ id: "RewindDatedAward" });

export type RewindDatedAward = z.infer<typeof rewindDatedAwardSchema>;

/** An award held by a pair playing together. */
export const rewindDuoAwardSchema = z
  .object({
    players: z.tuple([rewindPlayerRefSchema, rewindPlayerRefSchema]),
    matchesTogether: z.number().int(),
    wins: z.number().int(),
    /** Win rate in percent (0-100), already rounded. */
    winRate: z.number(),
  })
  .meta({ id: "RewindDuoAward" });

export type RewindDuoAward = z.infer<typeof rewindDuoAwardSchema>;

/** An award held by a pair facing each other. Record is from `players[0]`'s point of view. */
export const rewindPairAwardSchema = z
  .object({
    players: z.tuple([rewindPlayerRefSchema, rewindPlayerRefSchema]),
    matchesPlayed: z.number().int(),
    wins: z.number().int(),
    losses: z.number().int(),
    draws: z.number().int(),
  })
  .meta({ id: "RewindPairAward" });

export type RewindPairAward = z.infer<typeof rewindPairAwardSchema>;

/** Every award is nullable: a season with no eligible candidate simply drops the line. */
export const rewindPerformanceAwardsSchema = z
  .object({
    /** Finished first. `value` = final MMR. */
    king: rewindAwardSchema.nullable(),
    /** Highest MMR reached at any point. `value` = that MMR. */
    peakMmr: rewindDatedAwardSchema.nullable(),
    /** Largest net MMR gain over the season. `value` = the gain. */
    progression: rewindAwardSchema.nullable(),
    /** Best win rate over REWIND_MIN_MATCHES_SNIPER matches. `value` = win rate (0-100). */
    sniper: rewindAwardSchema.nullable(),
  })
  .meta({ id: "RewindPerformanceAwards" });

export type RewindPerformanceAwards = z.infer<typeof rewindPerformanceAwardsSchema>;

export const rewindCombatAwardsSchema = z
  .object({
    /** Largest MMR gap between the two sides overturned in a single win. `value` = the gap. */
    biggestUpset: rewindDatedAwardSchema.nullable(),
    /**
     * Most wins against an opposition rated more than STRONGER_OPPONENT_MMR_GAP
     * above their own side. `value` = that count.
     */
    giantKiller: rewindAwardSchema.nullable(),
    /** Most wins against whoever was ranked #1 at the time. `value` = that count. */
    leaderHunter: rewindAwardSchema.nullable(),
    /** Most played duel of the season. */
    rivalry: rewindPairAwardSchema.nullable(),
    /** Player against whom the most others hold a losing record. `value` = that head count. */
    nemesis: rewindAwardSchema.nullable(),
  })
  .meta({ id: "RewindCombatAwards" });

export type RewindCombatAwards = z.infer<typeof rewindCombatAwardsSchema>;

export const rewindEnduranceAwardsSchema = z
  .object({
    /** Most matches played. `value` = that count. */
    marathon: rewindAwardSchema.nullable(),
    /** Most matches spent ranked #1 — measured in matches, never in days. */
    topOneKing: rewindAwardSchema.nullable(),
    /** Most matches spent in the top 3. */
    topThreeKing: rewindAwardSchema.nullable(),
    /** Most matches spent in the top 5. */
    topFiveKing: rewindAwardSchema.nullable(),
    /** Longest run of consecutive wins. `value` = its length. */
    longestStreak: rewindAwardSchema.nullable(),
  })
  .meta({ id: "RewindEnduranceAwards" });

export type RewindEnduranceAwards = z.infer<typeof rewindEnduranceAwardsSchema>;

export const rewindCooperationAwardsSchema = z
  .object({
    /** Best win ratio as a pair over REWIND_MIN_MATCHES_DUO matches together. */
    duo: rewindDuoAwardSchema.nullable(),
    /** Player with whom the most others hold a winning record. `value` = that head count. */
    bestPartner: rewindAwardSchema.nullable(),
  })
  .meta({ id: "RewindCooperationAwards" });

export type RewindCooperationAwards = z.infer<typeof rewindCooperationAwardsSchema>;

/**
 * Fair-play / MVP awards, present only when the season ran votes. Optional rather
 * than versioned: a payload generated before votes existed simply has none, and
 * the deck skips the card.
 */
export const rewindVoteAwardsSchema = z
  .object({
    /** Best smoothed fair-play rate past the vote threshold. `value` = rate (0-100), `detail` = votes received. */
    fairPlayPrize: rewindAwardSchema.nullable(),
    /** The fair-play podium, prize winner included. */
    fairPlayPodium: z.array(rewindAwardSchema),
    /** Most MVP titles. `value` = titles. */
    teamCarrier: rewindAwardSchema.nullable(),
    /** Most votes cast, fair-play and MVP. Voter award. */
    mostInvolved: rewindAwardSchema.nullable(),
    /** Highest share of 👍 among the fair-play votes cast (0-100). Voter award. */
    kindest: rewindAwardSchema.nullable(),
    /** Highest share of 👎 among the fair-play votes cast (0-100) — never who they targeted. Voter award. */
    strictestJudge: rewindAwardSchema.nullable(),
    /** Most matches watched as a declared spectator. */
    topSupporter: rewindAwardSchema.nullable(),
    /** Lowest fair-play rate. Only when the season opted into a public negative award. */
    fairPlayWorst: rewindAwardSchema.nullable(),
    totals: z.object({
      votes: z.number().int(),
      /** Share of 👍 (0-100), null without any fair-play vote. */
      positiveRate: z.number().nullable(),
      topTag: fairPlayTagSchema.nullable(),
    }),
  })
  .meta({ id: "RewindVoteAwards" });

export type RewindVoteAwards = z.infer<typeof rewindVoteAwardsSchema>;

export const rewindSeasonInfoSchema = z
  .object({
    seasonId: z.string(),
    name: z.string(),
    disciplineName: z.string().nullable(),
    startDate: z.date(),
    endDate: z.date(),
    /**
     * Whether the season ever produced a draw. A discipline without draws would
     * otherwise be shown a "0 draws" tile and an unbeaten streak that can only
     * repeat the win streak.
     */
    allowDraw: z.boolean(),
  })
  .meta({ id: "RewindSeasonInfo" });

export type RewindSeasonInfo = z.infer<typeof rewindSeasonInfoSchema>;

export const rewindSeasonTotalsSchema = z
  .object({
    playerCount: z.number().int(),
    matchCount: z.number().int(),
    averageMmr: z.number(),
  })
  .meta({ id: "RewindSeasonTotals" });

export type RewindSeasonTotals = z.infer<typeof rewindSeasonTotalsSchema>;

export const seasonRewindPayloadSchema = z
  .object({
    version: z.number().int(),
    season: rewindSeasonInfoSchema,
    totals: rewindSeasonTotalsSchema,
    performance: rewindPerformanceAwardsSchema,
    combat: rewindCombatAwardsSchema,
    endurance: rewindEnduranceAwardsSchema,
    cooperation: rewindCooperationAwardsSchema,
    votes: rewindVoteAwardsSchema.optional(),
  })
  .meta({ id: "SeasonRewindPayload" });

export type SeasonRewindPayload = z.infer<typeof seasonRewindPayloadSchema>;

// ============================================
// Per-player payload
// ============================================

export const rewindFinalRankSchema = z
  .object({
    rank: z.number().int(),
    totalPlayers: z.number().int(),
    mmr: z.number(),
    tier: rewindTierRefSchema.nullable(),
  })
  .meta({ id: "RewindFinalRank" });

export type RewindFinalRank = z.infer<typeof rewindFinalRankSchema>;

export const rewindTotalsSchema = z
  .object({
    matchesPlayed: z.number().int(),
    wins: z.number().int(),
    losses: z.number().int(),
    draws: z.number().int(),
    /** Win rate in percent (0-100), already rounded. */
    winRate: z.number(),
  })
  .meta({ id: "RewindTotals" });

export type RewindTotals = z.infer<typeof rewindTotalsSchema>;

export const rewindMmrJourneySchema = z
  .object({
    initialMmr: z.number(),
    finalMmr: z.number(),
    netDelta: z.number(),
    points: z.array(mmrChartPointSchema),
  })
  .meta({ id: "RewindMmrJourney" });

export type RewindMmrJourney = z.infer<typeof rewindMmrJourneySchema>;

export const rewindBestRankSchema = z
  .object({
    bestRank: z.number().int(),
    matchesInTop1: z.number().int(),
    matchesInTop3: z.number().int(),
    matchesInTop5: z.number().int(),
  })
  .meta({ id: "RewindBestRank" });

export type RewindBestRank = z.infer<typeof rewindBestRankSchema>;

export const rewindPeakSchema = z
  .object({
    mmr: z.number(),
    /** Null when the player never climbed above their starting MMR. */
    matchId: z.string().nullable(),
    playedAt: z.date().nullable(),
    /** Tier that peak MMR sat in — not necessarily the one the season ended on. */
    tier: rewindTierRefSchema.nullable(),
  })
  .meta({ id: "RewindPeak" });

export type RewindPeak = z.infer<typeof rewindPeakSchema>;

export const rewindStreaksSchema = z
  .object({
    bestWinStreak: z.number().int(),
    /** MMR banked over that run. Two runs of equal length rarely pay the same. */
    bestWinStreakMmr: z.number(),
    bestUnbeatenStreak: z.number().int(),
    worstLossStreak: z.number().int(),
    /** MMR dropped over that run, negative. */
    worstLossStreakMmr: z.number(),
  })
  .meta({ id: "RewindStreaks" });

export type RewindStreaks = z.infer<typeof rewindStreaksSchema>;

/** A single match worth telling a story about. */
export const rewindFeatMatchSchema = z
  .object({
    matchId: z.string(),
    playedAt: z.date(),
    opponent: rewindPlayerRefSchema.nullable(),
    mmrDelta: z.number(),
    /**
     * How much stronger the opposing side was, in MMR, before the match —
     * measured between the two side averages, so a 2v2 gap reads like a 1v1 one.
     */
    mmrGap: z.number(),
    format: rewindMatchFormatSchema,
  })
  .meta({ id: "RewindFeatMatch" });

export type RewindFeatMatch = z.infer<typeof rewindFeatMatchSchema>;

export const rewindFeatsSchema = z
  .object({
    /**
     * The match that paid the most MMR. Not the same as the biggest upset: the MMR
     * gap is only one input, and an outcome type carries its own multiplier.
     */
    bestMmrGain: rewindFeatMatchSchema.nullable(),
    /** Win against the largest MMR gap, whatever it paid. */
    biggestUpsetGap: rewindFeatMatchSchema.nullable(),
    /**
     * Wins where the opposing side averaged more than STRONGER_OPPONENT_MMR_GAP
     * above the player's own side — the same bar as the profile's win rate by
     * opponent level, but measured side against side rather than against a single
     * rating.
     */
    giantKillerWins: z.number().int(),
    bestPartner: playerRelationStatSchema.nullable(),
    mostFacedOpponent: playerRelationStatSchema.nullable(),
    nemesis: playerRelationStatSchema.nullable(),
  })
  .meta({ id: "RewindFeats" });

export type RewindFeats = z.infer<typeof rewindFeatsSchema>;

/**
 * Where the player sits on one metric. The percentage alone is too coarse to
 * mean much in a small league — "top 25 %" of eight players is second place —
 * so the absolute position and the size of the population it was measured
 * against travel with it.
 */
export const rewindPercentileEntrySchema = z
  .object({
    /** "Top X %", lower is better. A value of 5 means the top 5 % on that metric. */
    topPercent: z.number(),
    /** Absolute position, 1-based. Ties share the best position. */
    rank: z.number().int(),
    /** How many players the position was taken among — not always the whole season. */
    poolSize: z.number().int(),
  })
  .meta({ id: "RewindPercentileEntry" });

export type RewindPercentileEntry = z.infer<typeof rewindPercentileEntrySchema>;

export const rewindPercentilesSchema = z
  .object({
    matchesPlayed: rewindPercentileEntrySchema,
    winRate: rewindPercentileEntrySchema,
    progression: rewindPercentileEntrySchema,
    winStreak: rewindPercentileEntrySchema,
  })
  .meta({ id: "RewindPercentiles" });

export type RewindPercentiles = z.infer<typeof rewindPercentilesSchema>;

export const rewindConclusionSchema = z
  .object({
    nextSeason: z
      .object({ id: z.string(), name: z.string(), startDate: z.date() })
      .nullable(),
  })
  .meta({ id: "RewindConclusion" });

export type RewindConclusion = z.infer<typeof rewindConclusionSchema>;

export const playerRewindPayloadSchema = z
  .object({
    version: z.number().int(),
    player: rewindPlayerRefSchema,
    finalRank: rewindFinalRankSchema,
    totals: rewindTotalsSchema,
    journey: rewindMmrJourneySchema,
    bestRank: rewindBestRankSchema,
    peak: rewindPeakSchema.nullable(),
    streaks: rewindStreaksSchema,
    feats: rewindFeatsSchema,
    badges: z.array(clientPlayerBadgeSchema),
    percentiles: rewindPercentilesSchema,
    conclusion: rewindConclusionSchema,
    /** Season awards this player holds — drives the highlight on the award cards. */
    awardsWon: z.array(rewindAwardKeySchema),
    /** The player's own fair-play / MVP figures, when the season ran votes. */
    votes: z
      .object({
        fairPlayRate: z.number().nullable(),
        fairPlayRank: z.number().int().nullable(),
        up: z.number().int(),
        down: z.number().int(),
        tags: z.array(tagCountSchema),
        mvpTitles: z.number().int(),
      })
      .optional(),
  })
  .meta({ id: "PlayerRewindPayload" });

export type PlayerRewindPayload = z.infer<typeof playerRewindPayloadSchema>;

// ============================================
// API responses
// ============================================

export const rewindBundleSchema = z
  .object({
    season: seasonRewindPayloadSchema,
    player: playerRewindPayloadSchema.nullable(),
  })
  .meta({ id: "RewindBundle" });

export type RewindBundle = z.infer<typeof rewindBundleSchema>;

export const rewindArchiveEntrySchema = z
  .object({
    seasonId: z.string(),
    seasonName: z.string(),
    disciplineName: z.string().nullable(),
    startDate: z.date(),
    endDate: z.date(),
    generatedAt: z.date(),
    viewedAt: z.date().nullable(),
  })
  .meta({ id: "RewindArchiveEntry" });

export type RewindArchiveEntry = z.infer<typeof rewindArchiveEntrySchema>;

export const rewindArchiveListSchema = z.array(rewindArchiveEntrySchema);

/**
 * The rewind currently worth putting in front of the player: generated less than
 * REWIND_PROMO_DAYS ago and not watched through to the end. The server owns this
 * decision entirely — the client never computes the window itself.
 */
export const rewindPromotionSchema = z
  .object({
    seasonId: z.string(),
    seasonName: z.string(),
    disciplineName: z.string().nullable(),
    endDate: z.date(),
    promotedUntil: z.date(),
    /** Set on first open: the season page only auto-opens the rewind while this is null. */
    openedAt: z.date().nullable(),
  })
  .meta({ id: "RewindPromotion" });

export type RewindPromotion = z.infer<typeof rewindPromotionSchema>;

export type RewindReadyEvent = {
  event: "rewind_ready";
  data: { seasonId: string };
};
