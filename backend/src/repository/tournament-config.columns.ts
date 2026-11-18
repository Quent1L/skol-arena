/**
 * Column projections for the two tournament config satellites.
 *
 * Both select the value fields only — `id` and `tournamentId` are noise once the
 * config is nested under its tournament — so a loaded row lines up exactly with
 * the shared `TournamentScoringConfig` / `ChampionshipConfig` types and can be
 * handed to the API response untouched.
 */

export const SCORING_CONFIG_COLUMNS = {
  pointPerVictory: true,
  pointPerDraw: true,
  pointPerLoss: true,
} as const;

export const CHAMPIONSHIP_CONFIG_COLUMNS = {
  maxMatchesPerPlayer: true,
  maxTimesWithSamePartner: true,
  maxTimesWithSameOpponent: true,
} as const;

export const VOTE_CONFIG_COLUMNS = {
  fairPlayEnabled: true,
  fairPlayMinVotes: true,
  fairPlayAlertThreshold: true,
  fairPlayPublicNegativeAward: true,
  mvpEnabled: true,
  mvpSpectatorsEnabled: true,
  mvpMinVotes: true,
  mvpTieRule: true,
  mvpSameTargetLimit: true,
  rewindVoterAwards: true,
  promptMaxMatchAgeMinutes: true,
} as const;

/** `with` clause loading every config on a tournament relational query. */
export const TOURNAMENT_CONFIGS_WITH = {
  scoringConfig: { columns: SCORING_CONFIG_COLUMNS },
  championshipConfig: { columns: CHAMPIONSHIP_CONFIG_COLUMNS },
  voteConfig: { columns: VOTE_CONFIG_COLUMNS },
} as const;
