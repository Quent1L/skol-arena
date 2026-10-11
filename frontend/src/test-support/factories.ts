import type {
  BaseTournament,
  ClientPlayerMmr,
  ClientRankTier,
  MmrAnimationEventResponse,
  PlayerCareerSeason,
  StandingsEntry,
} from '@skol-arena/shared'
import { CHAMPIONSHIP_DEFAULTS, resolveScoringConfig } from '@skol-arena/shared'

let seq = 0
function nextId(prefix: string): string {
  seq += 1
  return `${prefix}${seq}`
}

export function makeMmrEvent(
  over: Partial<MmrAnimationEventResponse> = {},
): MmrAnimationEventResponse {
  return {
    id: nextId('e'),
    matchId: nextId('m'),
    seasonId: 's',
    eventType: 'official',
    reason: 'match_finalized',
    mmrBefore: 1000,
    mmrAfter: 1000,
    mmrDelta: 0,
    displayDelta: 0,
    tierBeforeLevel: null,
    tierAfterLevel: null,
    tierBeforeName: null,
    tierAfterName: null,
    rankChanged: false,
    encouragementMessage: null,
    createdAt: '',
    opponents: [],
    teammates: [],
    ...over,
  }
}

export function makeTier(over: Partial<ClientRankTier> = {}): ClientRankTier {
  return {
    id: nextId('tier'),
    seasonId: 's',
    level: 1,
    name: 'Bronze',
    nameKey: null,
    percentile: 0,
    minMmr: 700,
    subRanks: 1,
    iconClass: null,
    calculatedAt: new Date('2026-01-01'),
    ...over,
  }
}

export function makeCareerSeason(over: Partial<PlayerCareerSeason> = {}): PlayerCareerSeason {
  const id = nextId('season')
  return {
    seasonId: id,
    seasonName: `Season ${id}`,
    seasonStatus: 'finished',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-06-30'),
    discipline: { id: 'disc-1', name: 'Babyfoot', icon: 'fa fa-futbol' },
    peakMmr: 1200,
    avgMmr: 1100,
    entryMmr: 1000,
    finalMmr: 1150,
    matchesPlayed: 10,
    wins: 6,
    losses: 3,
    draws: 1,
    placementMatches: 5,
    placementsComplete: true,
    tiers: [],
    ...over,
  }
}

export function makePlayerMmr(over: Partial<ClientPlayerMmr> = {}): ClientPlayerMmr {
  const id = nextId('p')
  return {
    id: nextId('mmr'),
    seasonId: 's',
    playerId: id,
    currentMmr: 1000,
    matchesPlayed: 5,
    wins: 3,
    losses: 2,
    draws: 0,
    winStreak: 0,
    maxWinStreak: 2,
    lossStreak: 0,
    maxLossStreak: 1,
    player: { id, displayName: `Player ${id}`, shortName: id.toUpperCase() },
    ...over,
  }
}

export function makeTournament(over: Partial<BaseTournament> = {}): BaseTournament {
  return {
    id: nextId('t'),
    name: 'Test Tournament',
    mode: 'championship',
    teamMode: 'flex',
    minTeamSize: 1,
    maxTeamSize: 1,
    maxSidesPerMatch: 2,
    scoringConfig: resolveScoringConfig(),
    championshipConfig: { ...CHAMPIONSHIP_DEFAULTS },
    allowDraw: true,
    scoreEnabled: true,
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-12-31T00:00:00.000Z',
    status: 'ongoing',
    validationMode: 'none',
    createdBy: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

export function makeStandingRow(over: Partial<StandingsEntry> = {}): StandingsEntry {
  return {
    id: nextId('s'),
    name: 'Team',
    shortName: 'TM',
    points: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    scored: 0,
    conceded: 0,
    scoreDiff: 0,
    matchesPlayed: 0,
    winLossRatio: 0,
    buchholzScore: 0,
    victoryQuality: 0,
    victoryQualityBreakdown: [],
    winRate: 0,
    headToHead: {},
    ...over,
  }
}
