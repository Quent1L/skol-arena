/**
 * What the demo instance contains: the people and the disciplines. The competitions
 * built on top of them live in `demo-seed.ts`.
 *
 * Everything is in English, the app's default language. Names are invented.
 */
import type { AvatarName } from "./avatars";
import type { DisciplineDef } from "./builders";

/** Shared by every demo account: the point is that anyone can sign in as anyone. */
export const DEMO_PASSWORD = "SkolDemo123!";
export const DEMO_EMAIL_DOMAIN = "skol.demo";
export const DEMO_ADMIN_KEY = "alex";

export type DemoPerson = {
  key: string;
  name: string;
  shortName: string;
  role: "player" | "tournament_admin" | "super_admin";
  /** Hidden skill, 0..1. Drives who wins; never surfaced in the app. */
  strength: number;
  avatar?: AvatarName;
};

export function demoEmail(key: string): string {
  return `${key}@${DEMO_EMAIL_DOMAIN}`;
}

/**
 * The super admin plays too: it is the account a visitor signs in with, so it is
 * the one with matches waiting for confirmation, a rank and a bracket to finish.
 */
export const DEMO_PEOPLE: DemoPerson[] = [
  { key: DEMO_ADMIN_KEY, name: "Alex Rivera", shortName: "ARI", role: "super_admin", strength: 0.68, avatar: "theo" },
  { key: "liam", name: "Liam Carter", shortName: "LCA", role: "tournament_admin", strength: 0.62, avatar: "lucas" },
  { key: "ava", name: "Ava Thompson", shortName: "ATH", role: "player", strength: 0.91, avatar: "anais" },
  { key: "sofia", name: "Sofia Romero", shortName: "SRO", role: "player", strength: 0.84, avatar: "camille" },
  { key: "noah", name: "Noah Bennett", shortName: "NBE", role: "player", strength: 0.78, avatar: "ilyas" },
  { key: "maya", name: "Maya Patel", shortName: "MPA", role: "player", strength: 0.73, avatar: "marta" },
  { key: "ethan", name: "Ethan Brooks", shortName: "EBR", role: "player", strength: 0.66 },
  { key: "chloe", name: "Chloe Martin", shortName: "CMA", role: "player", strength: 0.6, avatar: "nina" },
  { key: "lucas", name: "Lucas Weber", shortName: "LWE", role: "player", strength: 0.57 },
  { key: "amara", name: "Amara Okafor", shortName: "AOK", role: "player", strength: 0.54 },
  { key: "daniel", name: "Daniel Kim", shortName: "DKI", role: "player", strength: 0.5 },
  { key: "isabella", name: "Isabella Rossi", shortName: "IRO", role: "player", strength: 0.47 },
  { key: "oliver", name: "Oliver Hughes", shortName: "OHU", role: "player", strength: 0.43 },
  { key: "hana", name: "Hana Suzuki", shortName: "HSU", role: "player", strength: 0.4 },
  { key: "mateo", name: "Mateo Silva", shortName: "MSI", role: "player", strength: 0.36 },
  { key: "grace", name: "Grace Walker", shortName: "GWA", role: "player", strength: 0.32 },
];

// ---------------------------------------------------------------------------
// Disciplines
// ---------------------------------------------------------------------------

export const POOL_OUTCOMES = {
  standard: "Standard win",
  foul: "Win on foul",
  forfeit: "Forfeit",
} as const;

export const POOL_FOUL_REASONS = [
  "Black ball potted early",
  "Scratch on the black",
  "Black ball in the wrong pocket",
] as const;

export const FORFEIT_REASONS = { noShow: "No-show", withdrawal: "Withdrawal" } as const;

/** Frames to win a pool match: a race to 5. */
export const POOL_RACE_TO = 5;

/**
 * The headline discipline. Its three ways of ending a match are what the outcome
 * types exist for: a win on foul counts in the standings but moves the rating less
 * (the opponent lost the frame rather than being outplayed), a forfeit counts in
 * the standings and leaves everybody's rating untouched.
 */
export const POOL: DisciplineDef = {
  name: "Pool (8-ball)",
  icon: "fa fa-circle-dot",
  scoreInstructions: `Race to ${POOL_RACE_TO} frames. Report the number of frames each player won.`,
  teamInteractionMode: "INDIVIDUAL",
  outcomes: [
    { name: POOL_OUTCOMES.standard, isDefault: true },
    { name: POOL_OUTCOMES.foul, mmrMultiplier: 0.75, reasons: [...POOL_FOUL_REASONS] },
    {
      name: POOL_OUTCOMES.forfeit,
      scoreCountsForMmr: false,
      reasons: [FORFEIT_REASONS.noShow, FORFEIT_REASONS.withdrawal],
    },
  ],
};

export const TABLE_FOOTBALL_OUTCOMES = {
  standard: "Standard win",
  goldenGoal: "Golden goal win",
  forfeit: "Forfeit",
} as const;

export const TABLE_FOOTBALL: DisciplineDef = {
  name: "Table football",
  icon: "fa fa-futbol",
  scoreInstructions: "First team to 10 goals. Report the final score for both teams.",
  teamInteractionMode: "COLLABORATIVE",
  outcomes: [
    { name: TABLE_FOOTBALL_OUTCOMES.standard, isDefault: true },
    // Decided at 9-9 on a single goal: close, so it moves the rating less.
    { name: TABLE_FOOTBALL_OUTCOMES.goldenGoal, mmrMultiplier: 0.8 },
    { name: TABLE_FOOTBALL_OUTCOMES.forfeit, scoreCountsForMmr: false, reasons: [FORFEIT_REASONS.noShow] },
  ],
};

export const DARTS: DisciplineDef = {
  name: "Darts",
  icon: "fa fa-bullseye",
  scoreInstructions: "501, double out, best of 5 legs. Report the number of legs each player won.",
  teamInteractionMode: "INDIVIDUAL",
  outcomes: [
    { name: "Standard win", isDefault: true },
    { name: "Forfeit", scoreCountsForMmr: false, reasons: [FORFEIT_REASONS.noShow, FORFEIT_REASONS.withdrawal] },
  ],
};
