/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Test helpers for working with the entry-based system in tests
 */

/**
 * Create a mock tournament entry for testing
 */
export function createMockEntry(params: {
  id?: string;
  tournamentId: string;
  entryType: "PLAYER" | "TEAM";
  teamId?: string;
  playerIds?: string[];
}): any {
  const entry: any = {
    id: params.id || `entry-${Date.now()}`,
    tournamentId: params.tournamentId,
    entryType: params.entryType,
    teamId: params.teamId || null,
    createdAt: new Date(),
  };

  // Add players relation
  if (params.playerIds) {
    entry.players = params.playerIds.map((playerId) => ({
      entryId: entry.id,
      playerId,
      player: {
        id: playerId,
        displayName: `Player ${playerId}`,
        externalId: `external-${playerId}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    }));
  }

  // Add team relation if TEAM type
  if (params.entryType === "TEAM" && params.teamId) {
    entry.team = {
      id: params.teamId,
      tournamentId: params.tournamentId,
      name: `Team ${params.teamId}`,
      createdBy: "test-user",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  return entry;
}

/**
 * Create mock match sides for testing
 */
export function createMockMatchSides(params: {
  matchId: string;
  entryAId: string;
  entryBId: string;
  scoreA?: number;
  scoreB?: number;
  pointsA?: number;
  pointsB?: number;
}): any[] {
  return [
    {
      id: `side-A-${params.matchId}`,
      matchId: params.matchId,
      entryId: params.entryAId,
      position: 1,
      score: params.scoreA ?? 0,
      pointsAwarded: params.pointsA ?? 0,
    },
    {
      id: `side-B-${params.matchId}`,
      matchId: params.matchId,
      entryId: params.entryBId,
      position: 2,
      score: params.scoreB ?? 0,
      pointsAwarded: params.pointsB ?? 0,
    },
  ];
}

/**
 * Create a mock match result for testing
 */
export function createMockMatchResult(params: {
  matchId: string;
  reportedBy?: string;
  reportedAt?: Date;
  reportProof?: string;
  finalizedBy?: string;
  finalizedAt?: Date;
  finalizationReason?: string;
}): any {
  return {
    matchId: params.matchId,
    reportedBy: params.reportedBy || null,
    reportedAt: params.reportedAt || null,
    reportProof: params.reportProof || null,
    finalizedBy: params.finalizedBy || null,
    finalizedAt: params.finalizedAt || null,
    finalizationReason: params.finalizationReason || null,
  };
}

/**
 * Build a synthetic teamA/teamB match object from entries and sides
 * This mimics what the match.repository.getById() does
 */
export function buildSyntheticMatchFromSides(baseMatch: any, sides: any[], result?: any): any {
  const sideA = sides[0];
  const sideB = sides[1];

  return {
    ...baseMatch,
    // Synthetic teamA/teamB from entries
    teamA: sideA?.entry ? buildTeamFromEntry(sideA.entry) : { id: "unknown", name: null, participants: [] },
    teamB: sideB?.entry ? buildTeamFromEntry(sideB.entry) : { id: "unknown", name: null, participants: [] },
    // Synthetic scores
    scoreA: sideA?.score ?? 0,
    scoreB: sideB?.score ?? 0,
    // Synthetic winner — read from persisted winnerSide on the match record
    winnerSide: baseMatch.winnerSide ?? determineWinnerSide(sideA?.score, sideB?.score),
    // Result metadata
    reportedBy: result?.reportedBy || null,
    reportedAt: result?.reportedAt || null,
    reportProof: result?.reportProof || null,
    finalizedBy: result?.finalizedBy || null,
    finalizedAt: result?.finalizedAt || null,
    finalizationReason: result?.finalizationReason || null,
    // Include sides for new consumers
    sides: sides,
  };
}

function buildTeamFromEntry(entry: any): any {
  if (entry.entryType === "TEAM") {
    return {
      id: entry.team?.id || entry.teamId,
      name: entry.team?.name || null,
      participants:
        entry.players?.map((ep: any) => ({
          user: ep.player,
        })) || [],
    };
  } else {
    // PLAYER entry - synthetic team
    return {
      id: entry.id,
      name: null,
      participants:
        entry.players?.map((ep: any) => ({
          user: ep.player,
        })) || [],
    };
  }
}

function determineWinnerSide(scoreA: number | undefined, scoreB: number | undefined): "A" | "B" | null {
  if (scoreA === undefined || scoreB === undefined) return null;
  if (scoreA > scoreB) return "A";
  if (scoreB > scoreA) return "B";
  return null; // draw
}
