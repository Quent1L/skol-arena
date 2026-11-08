import { describe, it, expect, beforeAll } from "bun:test";
import { createTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { OutcomeReasonRepository } from "../../../repository/outcome-reason.repository";
import { pushDeviceRepository } from "../../../repository/push-device.repository";
import { teamRepository } from "../../../repository/team.repository";
import { makeSeeder } from "../helpers/db-seed";
import { disciplines, outcomeTypes } from "../../../db/schema";

const seed = makeSeeder(testDb);
const reasons = new OutcomeReasonRepository();
const MISSING = "00000000-0000-4000-8000-000000000000";

describe("outcome reasons (integration)", () => {
  let outcomeTypeId: string;
  let otherTypeId: string;

  beforeAll(async () => {
    const [discipline] = await testDb.insert(disciplines).values({ name: `Disc-${Date.now()}` }).returning();
    const [a, b] = await testDb
      .insert(outcomeTypes)
      .values([
        { disciplineId: discipline!.id, name: "Forfeit" },
        { disciplineId: discipline!.id, name: "Penalties" },
      ])
      .returning();
    outcomeTypeId = a!.id;
    otherTypeId = b!.id;
  });

  it("creates, reads with its outcome type and discipline, and updates", async () => {
    const created = await reasons.create({ outcomeTypeId, name: "No show" });
    const found = await reasons.getById(created!.id);
    expect(found?.outcomeType.name).toBe("Forfeit");
    expect(found?.outcomeType.discipline).toBeDefined();
    expect(await reasons.getById(MISSING)).toBeUndefined();

    const updated = await reasons.update(created!.id, { name: "Walkover", outcomeTypeId: otherTypeId });
    expect(updated).toMatchObject({ name: "Walkover", outcomeTypeId: otherTypeId });
  });

  it("lists by name, optionally for one outcome type", async () => {
    await reasons.create({ outcomeTypeId, name: "Zzz" });
    await reasons.create({ outcomeTypeId, name: "Aaa" });
    const all = await reasons.list();
    expect(all.length).toBeGreaterThanOrEqual(3);
    const forType = await reasons.list(outcomeTypeId);
    expect(forType.map((r) => r.name)).toEqual(["Aaa", "Zzz"]);
  });

  it("reports no blocker for an unused reason, then deletes it", async () => {
    const created = await reasons.create({ outcomeTypeId, name: "Temp" });
    expect(await reasons.getDeletionBlockers(created!.id)).toEqual([]);
    await reasons.delete(created!.id);
    expect(await reasons.getById(created!.id)).toBeUndefined();
  });

  it("reports the matches that use a reason and refuses to delete it", async () => {
    const admin = await seed.createUser("Admin");
    const [p1, p2] = await Promise.all([seed.createUser("P1"), seed.createUser("P2")]);
    const tournamentId = await seed.createTournament(admin);
    const [e1, e2] = await Promise.all([seed.createEntry(tournamentId, [p1]), seed.createEntry(tournamentId, [p2])]);
    const matchId = await seed.createMatch({ tournamentId, entryA: e1, entryB: e2 });
    const reason = await reasons.create({ outcomeTypeId, name: "Used" });
    const { matches } = await import("../../../db/schema");
    const { eq } = await import("drizzle-orm");
    await testDb.update(matches).set({ outcomeReasonId: reason!.id }).where(eq(matches.id, matchId));

    expect(await reasons.getDeletionBlockers(reason!.id)).toEqual([{ resource: "matches", count: 1 }]);
    await expect(reasons.delete(reason!.id)).rejects.toThrow();
  });
});

describe("push devices (integration)", () => {
  let userId: string;
  let otherId: string;
  const device = (endpoint: string, extra: Record<string, unknown> = {}) =>
    ({ deviceType: "WEB", subscriptionEndpoint: endpoint, subscriptionData: { keys: { p256dh: "x", auth: "y" } }, ...extra }) as never;

  beforeAll(async () => {
    userId = await seed.createUser("Pusher");
    otherId = await seed.createUser("Other");
  });

  it("registers a device and finds it by endpoint", async () => {
    const [created] = await pushDeviceRepository.register(userId, device("https://push.example/a", { locale: "fr", timezone: "Europe/Paris" }));
    expect(created).toMatchObject({ userId, active: true, locale: "fr", timezone: "Europe/Paris" });
    expect((await pushDeviceRepository.findByEndpoint("https://push.example/a"))?.id).toBe(created!.id);
    expect(await pushDeviceRepository.findByEndpoint("https://push.example/none")).toBeNull();
  });

  it("re-registers an existing endpoint under the new owner instead of duplicating it", async () => {
    const [first] = await pushDeviceRepository.register(userId, device("https://push.example/b"));
    const [again] = await pushDeviceRepository.register(otherId, device("https://push.example/b", { locale: "en" }));
    expect(again!.id).toBe(first!.id);
    expect(again).toMatchObject({ userId: otherId, locale: "en", active: true });
  });

  it("lists active devices, and removes only the owner's device", async () => {
    const [d] = await pushDeviceRepository.register(userId, device("https://push.example/c"));
    expect((await pushDeviceRepository.getActiveForUser(userId)).map((x) => x.id)).toContain(d!.id);

    expect(await pushDeviceRepository.remove(otherId, d!.id)).toHaveLength(0);
    expect(await pushDeviceRepository.remove(userId, d!.id)).toHaveLength(1);
    expect((await pushDeviceRepository.getActiveForUser(userId)).map((x) => x.id)).not.toContain(d!.id);
  });
});

describe("teams (integration)", () => {
  let admin: string;
  let ann: string;
  let bob: string;
  let tournamentId: string;

  beforeAll(async () => {
    admin = await seed.createUser("Admin");
    ann = await seed.createUser("Ann");
    bob = await seed.createUser("Bob");
    tournamentId = await seed.createTournament(admin, { teamMode: "static" });
  });

  it("creates a team and reads it with its members and match flag", async () => {
    const team = await teamRepository.create({ tournamentId, name: "Reds", createdBy: admin });
    await teamRepository.addMember(team!.id, ann);
    const found = await teamRepository.getById(team!.id);
    expect(found?.members.map((m) => m.user.id)).toEqual([ann]);
    expect(found?.hasMatch).toBe(false);
    expect(await teamRepository.getById(MISSING)).toBeNull();
    expect(await teamRepository.isMember(team!.id, ann)).toBe(true);
    expect(await teamRepository.isMember(team!.id, bob)).toBe(false);
    expect(await teamRepository.getMemberCount(team!.id)).toBe(1);
    expect((await teamRepository.getUserTeamInTournament(tournamentId, ann))?.id).toBe(team!.id);
    expect(await teamRepository.getUserTeamInTournament(tournamentId, bob)).toBeNull();
  });

  it("enforces the size cap and one team per player when adding", async () => {
    const team = await teamRepository.create({ tournamentId, name: "Blues", createdBy: admin });
    expect(await teamRepository.addMemberIfAllowed(tournamentId, team!.id, bob, 1)).toBe("added");
    expect(await teamRepository.addMemberIfAllowed(tournamentId, team!.id, admin, 1)).toBe("full");
    expect(await teamRepository.addMemberIfAllowed(tournamentId, team!.id, bob, 5)).toBe("already_in_team");
    await teamRepository.removeMember(team!.id, bob);
    expect(await teamRepository.isMember(team!.id, bob)).toBe(false);
  });

  it("lists a tournament's teams flagging those that have played, and deletes", async () => {
    const played = await teamRepository.create({ tournamentId, name: "Played", createdBy: admin });
    const { tournamentEntries } = await import("../../../db/schema");
    await testDb.insert(tournamentEntries).values({ tournamentId, entryType: "TEAM", teamId: played!.id });

    const list = await teamRepository.getByTournament(tournamentId);
    expect(list.find((t) => t.id === played!.id)?.hasMatch).toBe(true);
    expect(list.filter((t) => !t.hasMatch).length).toBeGreaterThanOrEqual(1);
    expect(await teamRepository.hasMatchEntry(played!.id)).toBe(true);

    const spare = await teamRepository.create({ tournamentId, name: "Spare", createdBy: admin });
    await teamRepository.delete(spare!.id);
    expect(await teamRepository.getById(spare!.id)).toBeNull();
  });
});
