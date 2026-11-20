import { describe, it, expect, afterAll, beforeAll, beforeEach } from "bun:test";
import { createTestDatabase, closeTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { and, eq, sql } from "drizzle-orm";
import { REWIND_VERSION } from "@skol-arena/shared/types/index";
import { seasonRewindService } from "../../season-rewind.service";
import { seasonRewindRepository } from "../../../repository/season-rewind.repository";
import {
  appUsers,
  user as betterAuthUser,
  disciplines,
  matches,
  matchSides,
  mmrHistory,
  playerMmr,
  playerSeasonRewinds,
  rankedSeasonConfigs,
  rankTiers,
  seasonRewinds,
  tournaments,
  tournamentEntries,
  tournamentEntryPlayers,
} from "../../../db/schema";

describe("Season rewind generation (integration)", () => {
  let adminId: string;
  let alice: string;
  let bob: string;
  let seasonId: string;
  let playedAtCursor: number;

  async function createPlayer(name: string) {
    const suffix = `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const [authUser] = await testDb
      .insert(betterAuthUser)
      .values({ id: `auth-${suffix}`, name, email: `${suffix}@example.com`, emailVerified: true })
      .returning();
    const [appUser] = await testDb
      .insert(appUsers)
      .values({
        displayName: name,
        shortName: name.slice(0, 3).toUpperCase(),
        externalId: authUser!.id,
        role: "player",
      })
      .returning();
    return appUser!.id;
  }

  async function createSeason(status: "ongoing" | "finished" = "finished", options: { allowDraw?: boolean } = {}) {
    const [season] = await testDb
      .insert(tournaments)
      .values({
        name: `Rewind Season ${Date.now()}-${Math.random().toString(16).slice(2)}`,
        mode: "ranked",
        allowDraw: options.allowDraw ?? true,
        teamMode: "flex",
        minTeamSize: 1,
        maxTeamSize: 1,
        startDate: "2026-01-01",
        endDate: "2026-06-30",
        status,
        createdBy: adminId,
      })
      .returning();

    await testDb.insert(rankedSeasonConfigs).values({ tournamentId: season!.id });
    return season!.id;
  }

  async function registerPlayer(targetSeasonId: string, playerId: string, mmr: number) {
    await testDb
      .insert(playerMmr)
      .values({ seasonId: targetSeasonId, playerId, currentMmr: mmr })
      .onConflictDoUpdate({
        target: [playerMmr.seasonId, playerMmr.playerId],
        set: { currentMmr: mmr },
      });
  }

  /** One finalized 1v1, with the entries, sides and MMR history a replay needs. */
  async function playMatch(params: {
    winner: string;
    loser: string;
    winnerMmr: [number, number];
    loserMmr: [number, number];
  }) {
    playedAtCursor += 60_000;
    const [match] = await testDb
      .insert(matches)
      .values({
        tournamentId: seasonId,
        status: "finalized",
        winnerSide: "A",
        playedAt: new Date(playedAtCursor),
        createdBy: adminId,
      })
      .returning();

    const sides: [string, number, [number, number], [number, number]][] = [
      [params.winner, 1, params.winnerMmr, params.loserMmr],
      [params.loser, 2, params.loserMmr, params.winnerMmr],
    ];

    for (const [playerId, position, own, opponent] of sides) {
      const [entry] = await testDb
        .insert(tournamentEntries)
        .values({ tournamentId: seasonId, entryType: "PLAYER" })
        .returning();
      await testDb.insert(tournamentEntryPlayers).values({ entryId: entry!.id, playerId });
      await testDb.insert(matchSides).values({ matchId: match!.id, entryId: entry!.id, position });
      await testDb.insert(mmrHistory).values({
        seasonId,
        playerId,
        matchId: match!.id,
        mmrBefore: own[0],
        mmrAfter: own[1],
        mmrDelta: own[1] - own[0],
        kEffective: 32,
        opponentAvgMmr: opponent[0],
        isPlacement: false,
        outcome: position === 1 ? "win" : "loss",
      });
    }
    return match!.id;
  }

  /** One finalized 2v2, so the duo and rivalry tallies have pairs to work on. */
  async function playTeamMatch(params: { winners: [string, string]; losers: [string, string] }) {
    playedAtCursor += 60_000;
    const [match] = await testDb
      .insert(matches)
      .values({
        tournamentId: seasonId,
        status: "finalized",
        winnerSide: "A",
        playedAt: new Date(playedAtCursor),
        createdBy: adminId,
      })
      .returning();

    const sides: [string[], number][] = [
      [params.winners, 1],
      [params.losers, 2],
    ];

    for (const [players, position] of sides) {
      const [entry] = await testDb
        .insert(tournamentEntries)
        .values({ tournamentId: seasonId, entryType: "TEAM" })
        .returning();
      await testDb.insert(tournamentEntryPlayers).values(players.map((playerId) => ({ entryId: entry!.id, playerId })));
      await testDb.insert(matchSides).values({ matchId: match!.id, entryId: entry!.id, position });

      for (const playerId of players) {
        await testDb.insert(mmrHistory).values({
          seasonId,
          playerId,
          matchId: match!.id,
          mmrBefore: 1000,
          mmrAfter: position === 1 ? 1016 : 984,
          mmrDelta: position === 1 ? 16 : -16,
          kEffective: 32,
          opponentAvgMmr: 1000,
          isPlacement: false,
          outcome: position === 1 ? "win" : "loss",
        });
      }
    }
    return match!.id;
  }

  beforeAll(async () => {
    adminId = await createPlayer("Admin");
  });

  // Without this the PGlite instance is still open at exit and bun leaves the
  // process with code 99, even though every test passed.
  afterAll(async () => {
    await closeTestDatabase();
  });

  beforeEach(async () => {
    playedAtCursor = Date.UTC(2026, 0, 1);
    alice = await createPlayer("Alice");
    bob = await createPlayer("Bob");
    seasonId = await createSeason();

    await registerPlayer(seasonId, alice, 1100);
    await registerPlayer(seasonId, bob, 900);
    await playMatch({ winner: alice, loser: bob, winnerMmr: [1000, 1050], loserMmr: [1000, 950] });
    await playMatch({ winner: alice, loser: bob, winnerMmr: [1050, 1100], loserMmr: [950, 900] });
  });

  it("stores a global payload and one deck per player", async () => {
    await seasonRewindService.generateForSeason(seasonId);

    const rewind = await seasonRewindRepository.getSeasonRewind(seasonId);
    expect(rewind).not.toBeNull();
    expect(rewind!.payload.totals).toMatchObject({ playerCount: 2, matchCount: 2 });

    const decks = await testDb.select().from(playerSeasonRewinds).where(eq(playerSeasonRewinds.rewindId, rewind!.id));
    expect(decks).toHaveLength(2);
  });

  it("builds a player deck from the replayed season", async () => {
    await seasonRewindService.generateForSeason(seasonId);
    const bundle = await seasonRewindService.getBundle(seasonId, alice);

    expect(bundle.player).not.toBeNull();
    expect(bundle.player!.totals).toMatchObject({ matchesPlayed: 2, wins: 2, losses: 0 });
    expect(bundle.player!.journey).toMatchObject({ initialMmr: 1000, finalMmr: 1100, netDelta: 100 });
    expect(bundle.player!.finalRank.rank).toBe(1);
    expect(bundle.player!.streaks.bestWinStreak).toBe(2);
    expect(bundle.player!.percentiles.winRate).toMatchObject({ rank: 1, poolSize: 2 });
  });

  it("carries the season's draw rule so the deck can hide the draw figures", async () => {
    seasonId = await createSeason("finished", { allowDraw: false });
    await registerPlayer(seasonId, alice, 1100);
    await registerPlayer(seasonId, bob, 900);
    await playMatch({ winner: alice, loser: bob, winnerMmr: [1000, 1050], loserMmr: [1000, 950] });

    await seasonRewindService.generateForSeason(seasonId);
    const bundle = await seasonRewindService.getBundle(seasonId, alice);

    expect(bundle.season.season.allowDraw).toBe(false);
  });

  it("names the tier of the final standing and of the peak separately", async () => {
    await testDb.insert(rankTiers).values([
      { seasonId, level: 1, name: "Rookie", percentile: 50, minMmr: 0, iconClass: "fa fa-seedling" },
      { seasonId, level: 2, name: "Expert", percentile: 10, minMmr: 1080, iconClass: null },
    ]);
    // Alice ends the season at 1100 after peaking there; Bob ends below the cut.
    await seasonRewindService.generateForSeason(seasonId);

    const winner = await seasonRewindService.getBundle(seasonId, alice);
    expect(winner.player!.finalRank.tier).toEqual({
      name: "Expert",
      nameKey: null,
      level: 2,
      iconClass: null,
    });
    expect(winner.player!.peak!.tier).toEqual({
      name: "Expert",
      nameKey: null,
      level: 2,
      iconClass: null,
    });

    const loser = await seasonRewindService.getBundle(seasonId, bob);
    expect(loser.player!.finalRank.tier!.name).toBe("Rookie");
    // Bob started at 1000 and only went down: the peak is the starting MMR.
    expect(loser.player!.peak).toMatchObject({ mmr: 1000, tier: { name: "Rookie" } });
  });

  it("hands the season awards to the players who earned them", async () => {
    await seasonRewindService.generateForSeason(seasonId);
    const bundle = await seasonRewindService.getBundle(seasonId, alice);

    expect(bundle.season.performance.king!.player.playerId).toBe(alice);
    expect(bundle.player!.awardsWon).toContain("king");
  });

  it("reads a duo's record the same way for both of its members", async () => {
    // Teammates share an outcome — unlike opponents, whose record mirrors. Player
    // ids are random uuids, so this covers both orders across runs.
    const carol = await createPlayer("Carol");
    const dave = await createPlayer("Dave");
    await registerPlayer(seasonId, carol, 1000);
    await registerPlayer(seasonId, dave, 1000);
    for (let i = 0; i < 3; i++) {
      await playTeamMatch({ winners: [alice, carol], losers: [bob, dave] });
    }

    await seasonRewindService.generateForSeason(seasonId);

    for (const [playerId, partnerId] of [
      [alice, carol],
      [carol, alice],
    ]) {
      const partner = (await seasonRewindService.getBundle(seasonId, playerId!)).player!.feats.bestPartner;
      expect(partner!.playerId).toBe(partnerId!);
      expect(partner).toMatchObject({ count: 3, wins: 3, losses: 0 });
    }

    // The losing duo is losing for both of them, not 3-0 for one of the two.
    for (const playerId of [bob, dave]) {
      const partner = (await seasonRewindService.getBundle(seasonId, playerId)).player!.feats.bestPartner;
      expect(partner).toMatchObject({ count: 3, wins: 0, losses: 3 });
    }
  });

  describe("next season", () => {
    async function createDiscipline() {
      const [discipline] = await testDb
        .insert(disciplines)
        .values({ name: `Discipline ${Date.now()}-${Math.random().toString(16).slice(2)}` })
        .returning();
      return discipline!.id;
    }

    it("resolves the next season at read time, not at generation time", async () => {
      const disciplineId = await createDiscipline();
      await testDb.update(tournaments).set({ disciplineId }).where(eq(tournaments.id, seasonId));

      // Snapshot taken while no follow-up season exists yet — the usual order of
      // events, since a new season is opened after the previous one closes.
      await seasonRewindService.generateForSeason(seasonId);
      let bundle = await seasonRewindService.getBundle(seasonId, alice);
      expect(bundle.player!.conclusion.nextSeason).toBeNull();

      const [next] = await testDb
        .insert(tournaments)
        .values({
          name: `Next Season ${Date.now()}`,
          mode: "ranked",
          teamMode: "flex",
          minTeamSize: 1,
          maxTeamSize: 1,
          startDate: "2026-07-01",
          endDate: "2026-12-31",
          status: "ongoing",
          disciplineId,
          createdBy: adminId,
        })
        .returning();

      // No regeneration: the already stored rewind must pick it up on its own.
      bundle = await seasonRewindService.getBundle(seasonId, alice);
      expect(bundle.player!.conclusion.nextSeason).toMatchObject({
        id: next!.id,
        name: next!.name,
      });
    });

    it("never points a season at itself", async () => {
      const disciplineId = await createDiscipline();
      await testDb.update(tournaments).set({ disciplineId, status: "ongoing" }).where(eq(tournaments.id, seasonId));
      await testDb.update(tournaments).set({ status: "finished" }).where(eq(tournaments.id, seasonId));

      await seasonRewindService.generateForSeason(seasonId);
      const bundle = await seasonRewindService.getBundle(seasonId, alice);
      expect(bundle.player!.conclusion.nextSeason).toBeNull();
    });
  });

  it("refuses to generate for a season that is still running", async () => {
    const ongoingId = await createSeason("ongoing");
    await expect(seasonRewindService.generateForSeason(ongoingId)).rejects.toThrow();
  });

  it("reports a missing rewind rather than an empty one", async () => {
    await expect(seasonRewindService.getBundle(seasonId, alice)).rejects.toThrow();
  });

  describe("promotion window", () => {
    async function shiftPromotion(playerId: string, days: number) {
      await testDb
        .update(playerSeasonRewinds)
        .set({ promotedUntil: new Date(Date.now() + days * 24 * 60 * 60 * 1000) })
        .where(eq(playerSeasonRewinds.playerId, playerId));
    }

    beforeEach(async () => {
      await seasonRewindService.generateForSeason(seasonId);
    });

    it("promotes a freshly generated rewind", async () => {
      const promoted = await seasonRewindService.getPromoted(alice);
      expect(promoted).not.toBeNull();
      expect(promoted!.seasonId).toBe(seasonId);
      expect(promoted!.openedAt).toBeNull();
    });

    it("stops promoting once the window has passed", async () => {
      await shiftPromotion(alice, -1);
      expect(await seasonRewindService.getPromoted(alice)).toBeNull();
    });

    it("keeps promoting a rewind that was merely opened", async () => {
      await seasonRewindService.markOpened(seasonId, alice);

      const promoted = await seasonRewindService.getPromoted(alice);
      expect(promoted).not.toBeNull();
      expect(promoted!.openedAt).not.toBeNull();
    });

    it("stops promoting once the deck has been watched to the end", async () => {
      await seasonRewindService.markViewed(seasonId, alice);
      expect(await seasonRewindService.getPromoted(alice)).toBeNull();
    });

    it("keeps the first opened_at stamp on repeated opens", async () => {
      await seasonRewindService.markOpened(seasonId, alice);
      const first = (await seasonRewindService.getPromoted(alice))!.openedAt;

      await seasonRewindService.markOpened(seasonId, alice);
      const second = (await seasonRewindService.getPromoted(alice))!.openedAt;
      expect(second).toEqual(first);
    });
  });

  describe("regeneration", () => {
    beforeEach(async () => {
      await seasonRewindService.generateForSeason(seasonId);
    });

    it("preserves the promotion window, opened and viewed stamps", async () => {
      await seasonRewindService.markOpened(seasonId, alice);
      await seasonRewindService.markViewed(seasonId, alice);

      const before = await seasonRewindRepository.getPlayerRewind(seasonId, alice);
      await seasonRewindService.generateForSeason(seasonId);
      const after = await seasonRewindRepository.getPlayerRewind(seasonId, alice);

      expect(after!.promotedUntil).toEqual(before!.promotedUntil);
      expect(after!.openedAt).toEqual(before!.openedAt);
      expect(after!.viewedAt).toEqual(before!.viewedAt);
    });

    it("does not resurrect the promo card for a player who already watched it", async () => {
      await seasonRewindService.markViewed(seasonId, alice);
      await seasonRewindService.generateForSeason(seasonId);

      expect(await seasonRewindService.getPromoted(alice)).toBeNull();
    });

    it("refreshes the payload and reuses the same rewind row", async () => {
      const first = await seasonRewindRepository.getSeasonRewind(seasonId);
      await playMatch({ winner: bob, loser: alice, winnerMmr: [900, 950], loserMmr: [1100, 1050] });
      await seasonRewindService.generateForSeason(seasonId);

      const second = await seasonRewindRepository.getSeasonRewind(seasonId);
      expect(second!.id).toBe(first!.id);
      expect(second!.payload.totals.matchCount).toBe(3);
    });

    it("keeps exactly one rewind row per season", async () => {
      await seasonRewindService.generateForSeason(seasonId);

      const rows = await testDb
        .select({ count: sql<number>`count(*)::int` })
        .from(seasonRewinds)
        .where(and(eq(seasonRewinds.seasonId, seasonId), eq(seasonRewinds.scope, "season")));
      expect(rows[0]!.count).toBe(1);
    });
  });

  describe("frozen formats", () => {
    /** Pretends the stored rewind was produced by a different build. */
    async function storeAsVersion(version: number) {
      await testDb.update(seasonRewinds).set({ version }).where(eq(seasonRewinds.seasonId, seasonId));
    }

    beforeEach(async () => {
      await seasonRewindService.generateForSeason(seasonId);
    });

    it("leaves a rewind stored in another format exactly as it was", async () => {
      const before = await seasonRewindRepository.getSeasonRewind(seasonId);
      await storeAsVersion(REWIND_VERSION + 1);

      // New match, and a regeneration that would normally pick it up.
      await playMatch({ winner: bob, loser: alice, winnerMmr: [900, 950], loserMmr: [1100, 1050] });
      await seasonRewindService.generateForSeason(seasonId);

      const after = await seasonRewindRepository.getSeasonRewind(seasonId);
      expect(after!.version).toBe(REWIND_VERSION + 1);
      expect(after!.payload.totals.matchCount).toBe(before!.payload.totals.matchCount);
    });

    it("keeps the player decks of a frozen rewind untouched", async () => {
      const before = await seasonRewindRepository.getPlayerRewind(seasonId, alice);
      await storeAsVersion(REWIND_VERSION + 1);

      await playMatch({ winner: bob, loser: alice, winnerMmr: [900, 950], loserMmr: [1100, 1050] });
      await seasonRewindService.generateForSeason(seasonId);

      const after = await seasonRewindRepository.getPlayerRewind(seasonId, alice);
      expect(after!.payload.totals).toEqual(before!.payload.totals);
      expect(after!.payload.journey).toEqual(before!.payload.journey);
    });

    it("still regenerates a rewind stored in the current format", async () => {
      await playMatch({ winner: bob, loser: alice, winnerMmr: [900, 950], loserMmr: [1100, 1050] });
      await seasonRewindService.generateForSeason(seasonId);

      const after = await seasonRewindRepository.getSeasonRewind(seasonId);
      expect(after!.payload.totals.matchCount).toBe(3);
    });
  });

  describe("identity refresh", () => {
    beforeEach(async () => {
      await seasonRewindService.generateForSeason(seasonId);
    });

    async function rename(playerId: string, displayName: string, shortName: string) {
      await testDb.update(appUsers).set({ displayName, shortName }).where(eq(appUsers.id, playerId));
    }

    it("rewrites an anonymised player's name in every payload of the rewind", async () => {
      await rename(alice, "Archive 7", "ARCH7");
      await seasonRewindService.refreshPlayerIdentities([alice]);

      const bundle = await seasonRewindService.getBundle(seasonId, alice);
      expect(bundle.season.performance.king!.player.displayName).toBe("Archive 7");
      expect(bundle.player!.player.displayName).toBe("Archive 7");
      expect(bundle.player!.player.shortName).toBe("ARCH7");
    });

    it("reaches the decks of the players they faced, not only their own", async () => {
      await rename(alice, "Archive 7", "ARCH7");
      await seasonRewindService.refreshPlayerIdentities([alice]);

      const bobDeck = (await seasonRewindService.getBundle(seasonId, bob)).player!;
      expect(bobDeck.feats.mostFacedOpponent!.displayName).toBe("Archive 7");
    });

    it("patches a rewind frozen in another format without regenerating it", async () => {
      // The whole point: a name has to be removable from a souvenir that the
      // generator is no longer allowed to rebuild.
      await testDb
        .update(seasonRewinds)
        .set({ version: REWIND_VERSION + 1 })
        .where(eq(seasonRewinds.seasonId, seasonId));

      await rename(alice, "Archive 7", "ARCH7");
      await seasonRewindService.refreshPlayerIdentities([alice]);

      const rewind = await seasonRewindRepository.getSeasonRewind(seasonId);
      expect(rewind!.version).toBe(REWIND_VERSION + 1);
      expect(rewind!.payload.performance.king!.player.displayName).toBe("Archive 7");
    });

    it("does nothing for a player who appears in no rewind", async () => {
      const carol = await createPlayer("Carol");
      await expect(seasonRewindService.refreshPlayerIdentities([carol])).resolves.toBeUndefined();
    });
  });

  describe("archive", () => {
    it("lists the player's rewinds with their viewed state", async () => {
      await seasonRewindService.generateForSeason(seasonId);

      let archive = await seasonRewindService.listArchive(alice);
      expect(archive).toHaveLength(1);
      expect(archive[0]!.seasonId).toBe(seasonId);
      expect(archive[0]!.viewedAt).toBeNull();

      await seasonRewindService.markViewed(seasonId, alice);
      archive = await seasonRewindService.listArchive(alice);
      expect(archive[0]!.viewedAt).not.toBeNull();
    });

    it("still lists a rewind whose promotion window has expired", async () => {
      await seasonRewindService.generateForSeason(seasonId);
      await testDb
        .update(playerSeasonRewinds)
        .set({ promotedUntil: new Date(Date.now() - 1000) })
        .where(eq(playerSeasonRewinds.playerId, alice));

      expect(await seasonRewindService.getPromoted(alice)).toBeNull();
      expect(await seasonRewindService.listArchive(alice)).toHaveLength(1);
    });
  });
});
