import { describe, it, expect, beforeAll } from "bun:test";
import { createTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { bracketRepository } from "../../../repository/bracket.repository";
import { makeSeeder } from "../helpers/db-seed";
import { matches } from "../../../db/schema";
import { eq } from "drizzle-orm";

const seed = makeSeeder(testDb);

describe("bracketRepository (integration)", () => {
  let tournamentId: string;
  let entryIds: string[];
  let configId: string;
  let roundIds: string[];
  let matchIds: string[];

  beforeAll(async () => {
    const admin = await seed.createUser("Admin");
    tournamentId = await seed.createTournament(admin, { mode: "bracket" });
    const players = await Promise.all(["a", "b", "c", "d"].map((n) => seed.createUser(n)));
    entryIds = await Promise.all(players.map((p) => seed.createEntry(tournamentId, [p])));

    const config = await bracketRepository.createConfig({
      tournamentId,
      bracketType: "single_elimination",
      seedingType: "random",
      totalParticipants: 4,
      roundsCount: 2,
      hasBronzeMatch: false,
    });
    configId = config!.id;
    const rounds = await bracketRepository.createRounds([
      { bracketConfigId: configId, roundNumber: 2, roundName: "Final", roundNameKey: "final", translationParams: null, bracketType: "winners", matchesCount: 1 },
      { bracketConfigId: configId, roundNumber: 1, roundName: "Semi", roundNameKey: "semi", translationParams: { n: 2 }, bracketType: "winners", matchesCount: 2 },
    ]);
    roundIds = rounds.map((r) => r.id);
    matchIds = [
      await seed.createMatch({ tournamentId, entryA: entryIds[0]!, entryB: entryIds[1]!, status: "scheduled", winnerSide: null }),
      await seed.createMatch({ tournamentId, entryA: entryIds[2]!, entryB: entryIds[3]!, status: "scheduled", winnerSide: null }),
      await seed.createMatch({ tournamentId, entryA: entryIds[0]!, entryB: entryIds[2]!, status: "scheduled", winnerSide: null }),
    ];
  });

  it("reads the config by tournament and by id", async () => {
    expect((await bracketRepository.getConfigByTournamentId(tournamentId))?.id).toBe(configId);
    expect((await bracketRepository.getConfigById(configId))?.roundsCount).toBe(2);
    expect(await bracketRepository.getConfigById("00000000-0000-4000-8000-000000000000")).toBeUndefined();
  });

  it("returns rounds in round order and finds one by id", async () => {
    const rounds = await bracketRepository.getRoundsByConfigId(configId);
    expect(rounds.map((r) => r.roundNumber)).toEqual([1, 2]);
    expect((await bracketRepository.getRoundById(roundIds[0]!))?.roundName).toBe("Final");
  });

  it("creates seeds and reads them back with their entries in seed order", async () => {
    await bracketRepository.createSeeds(
      entryIds.map((entryId, i) => ({ bracketConfigId: configId, entryId, seedNumber: 4 - i, seedingScore: i })),
    );
    const seeds = await bracketRepository.getSeedsByConfigId(configId);
    expect(seeds.map((s) => s.seedNumber)).toEqual([1, 2, 3, 4]);
    expect(seeds[0]!.entry.players).toHaveLength(1);
    expect((await bracketRepository.getSeedByEntryId(configId, entryIds[0]!))?.seedNumber).toBe(4);
    expect(await bracketRepository.getSeedByEntryId(configId, "00000000-0000-4000-8000-000000000000")).toBeUndefined();
  });

  it("stores match metadata, reads it back and updates the links", async () => {
    const [semiRound, finalRound] = [roundIds[1]!, roundIds[0]!];
    const m1 = await bracketRepository.createMatchMetadata({ matchId: matchIds[0]!, bracketRoundId: semiRound, matchNumber: 1, isByeMatch: false });
    await bracketRepository.createMatchMetadata({ matchId: matchIds[1]!, bracketRoundId: semiRound, matchNumber: 2, isByeMatch: false });
    await bracketRepository.createMatchMetadata({ matchId: matchIds[2]!, bracketRoundId: finalRound, matchNumber: 1, isByeMatch: false });
    expect(m1?.isByeMatch).toBe(false);

    const withRound = await bracketRepository.getMetadataByMatchId(matchIds[0]!);
    expect(withRound?.bracketRound.roundName).toBe("Semi");
    expect((await bracketRepository.getMetadataByRoundId(semiRound)).map((m) => m.matchNumber)).toEqual([1, 2]);

    const updated = await bracketRepository.updateMatchMetadata(matchIds[0]!, { winnerToMatchId: matchIds[2]! });
    expect(updated?.winnerToMatchId).toBe(matchIds[2]!);
  });

  it("assembles the whole bracket for a tournament", async () => {
    const data = await bracketRepository.getBracketDataByTournamentId(tournamentId);
    expect(data?.rounds).toHaveLength(2);
    expect(data?.seeds).toHaveLength(4);
    expect(data?.matches).toHaveLength(3);
    const linked = data!.matches.find((m) => m.metadata.matchId === matchIds[0]);
    expect(linked?.metadata.winnerToMatchId).toBe(matchIds[2]!);
    expect(linked?.round.roundName).toBe("Semi");
    expect(await bracketRepository.getBracketDataByTournamentId("00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("counts the matches of a bracket", async () => {
    expect(await bracketRepository.countMatchesByConfigId(configId)).toBe(3);
  });

  it("deletes the bracket along with its matches, and tolerates having none", async () => {
    await bracketRepository.deleteAllBracketData(tournamentId);
    expect(await bracketRepository.getConfigByTournamentId(tournamentId)).toBeUndefined();
    expect(await testDb.select().from(matches).where(eq(matches.tournamentId, tournamentId))).toHaveLength(0);
    await bracketRepository.deleteAllBracketData(tournamentId);
  });

  it("deletes inside a caller-supplied transaction", async () => {
    const admin = await seed.createUser("Admin2");
    const t2 = await seed.createTournament(admin, { mode: "bracket" });
    const config = await bracketRepository.createConfig({
      tournamentId: t2, bracketType: "single_elimination", seedingType: "random", totalParticipants: 2, roundsCount: 1, hasBronzeMatch: false,
    });
    await testDb.transaction(async (tx) => {
      await bracketRepository.deleteAllBracketData(t2, tx as never);
    });
    expect(await bracketRepository.getConfigById(config!.id)).toBeUndefined();
    expect(await bracketRepository.countMatchesByConfigId(config!.id)).toBe(0);
  });
});
