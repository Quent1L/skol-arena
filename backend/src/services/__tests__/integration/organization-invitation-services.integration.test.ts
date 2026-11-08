import { describe, it, expect, beforeAll } from "bun:test";
import { createTestDatabase } from "../../../config/test-database";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";

// Initialize the test database BEFORE any imports that use `db`.
const testDb: PgliteDatabase<typeof schema> = await createTestDatabase();

import { organizationService } from "../../organization.service";
import { invitationService } from "../../invitation.service";
import { invitationRepository } from "../../../repository/invitation.repository";
import { organizationRepository } from "../../../repository/organization.repository";
import { userRepository } from "../../../repository/user.repository";
import { makeSeeder } from "../helpers/db-seed";
import { appUsers, invitationCodes, user as authUser } from "../../../db/schema";
import { eq } from "drizzle-orm";
import { BadRequestError, ConflictError, NotFoundError } from "../../../types/errors";

const seed = makeSeeder(testDb);
const MISSING = "00000000-0000-4000-8000-000000000000";
let tag = 0;

async function externalIdOf(appUserId: string): Promise<string> {
  const row = await userRepository.getById(appUserId);
  return row!.externalId!;
}

describe("organizationService (integration)", () => {
  let owner: string;
  let member: string;
  let orgId: string;

  beforeAll(async () => {
    owner = await seed.createUser("Owner");
    member = await seed.createUser("Member");
    orgId = (await organizationService.createOrganization(`Org-${Date.now()}`, owner)).id;
  });

  it("makes the creator the owner and lists the organisation", async () => {
    const members = await organizationService.getMembers(orgId);
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ role: "owner" });
    expect((await organizationService.getAllOrganizations()).some((o) => o.id === orgId)).toBe(true);
  });

  it("adds a member directly, refusing duplicates and unknown organisations", async () => {
    await organizationService.addMemberDirect(orgId, member);
    await expect(organizationService.addMemberDirect(orgId, member)).rejects.toBeInstanceOf(ConflictError);
    await expect(organizationService.addMemberDirect(MISSING, member)).rejects.toBeInstanceOf(NotFoundError);
    expect(await organizationRepository.getUserOrganizationIds(member)).toEqual([orgId]);
    expect(await organizationRepository.isOwnerOfSharedOrganization(owner, member)).toBe(true);
    expect(await organizationRepository.isOwnerOfSharedOrganization(member, owner)).toBe(false);
  });

  it("removes a member, refusing unknown ones", async () => {
    const guest = await seed.createUser("Guest");
    await organizationService.addMemberDirect(orgId, guest);
    await organizationService.removeMember(orgId, guest);
    await expect(organizationService.removeMember(orgId, guest)).rejects.toBeInstanceOf(NotFoundError);
    await expect(organizationService.removeMember(MISSING, guest)).rejects.toBeInstanceOf(NotFoundError);
    await expect(organizationService.getMembers(MISSING)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("renames an organisation", async () => {
    const renamed = await organizationService.renameOrganization(orgId, "Renamed");
    expect(renamed?.name).toBe("Renamed");
    await expect(organizationService.renameOrganization(MISSING, "x")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("authorises anyone for a public tournament and members only for an organisation's", async () => {
    expect(await organizationService.isUserAuthorizedForTournament(null, member)).toBe(true);
    expect(await organizationService.isUserAuthorizedForTournament(undefined, member)).toBe(true);
    expect(await organizationService.isUserAuthorizedForTournament(orgId, member)).toBe(true);
    const stranger = await seed.createUser("Stranger");
    expect(await organizationService.isUserAuthorizedForTournament(orgId, stranger)).toBe(false);
  });

  describe("joining with a code", () => {
    const makeCode = (extra: Partial<typeof invitationCodes.$inferInsert> = {}) =>
      invitationRepository.create({
        code: `join-${Date.now()}-${tag++}`,
        createdBy: owner,
        maxUses: 1,
        organizationId: orgId,
        ...extra,
      });

    it("adds the user and counts the use", async () => {
      const joiner = await seed.createUser("Joiner");
      const code = await makeCode();
      const result = await organizationService.joinViaCode(code!.code, joiner, await externalIdOf(joiner), "j@x.io", "1.2.3.4");
      expect(result.organizationName).toBe("Renamed");
      expect(await organizationRepository.isMember(orgId, joiner)).toBe(true);
      expect((await invitationRepository.findByCode(code!.code))?.usedCount).toBe(1);
    });

    it("refuses unknown, inactive, expired, exhausted, non-organisation and already-member cases", async () => {
      const joiner = await seed.createUser("Refused");
      const ext = await externalIdOf(joiner);
      const join = (code: string, user = joiner) => organizationService.joinViaCode(code, user, ext, "r@x.io");

      await expect(join("nope")).rejects.toBeInstanceOf(NotFoundError);

      const inactive = await makeCode({ isActive: false });
      await expect(join(inactive!.code)).rejects.toBeInstanceOf(BadRequestError);
      const expired = await makeCode({ expiresAt: new Date(Date.now() - 1000) });
      await expect(join(expired!.code)).rejects.toBeInstanceOf(BadRequestError);
      const exhausted = await makeCode({ maxUses: 1 });
      await testDb.update(invitationCodes).set({ usedCount: 1 }).where(eq(invitationCodes.id, exhausted!.id));
      await expect(join(exhausted!.code)).rejects.toBeInstanceOf(BadRequestError);
      const global = await makeCode({ organizationId: null });
      await expect(join(global!.code)).rejects.toBeInstanceOf(BadRequestError);
      const fine = await makeCode();
      await expect(join(fine!.code, owner)).rejects.toBeInstanceOf(ConflictError);
    });
  });
});

describe("invitationService (integration)", () => {
  let admin: string;

  beforeAll(async () => {
    admin = await seed.createUser("InviteAdmin");
  });

  it("generates a unique code with defaults, or with limits and an organisation", async () => {
    const plain = await invitationService.generateCode({ createdBy: admin });
    expect(plain).toMatchObject({ maxUses: 1, expiresAt: null, notes: null, organizationId: null });

    const org = await organizationService.createOrganization(`InviteOrg-${Date.now()}`, admin);
    const rich = await invitationService.generateCode({ createdBy: admin, maxUses: 5, expiresInDays: 2, notes: "for the club", organizationId: org.id });
    expect(rich).toMatchObject({ maxUses: 5, notes: "for the club", organizationId: org.id });
    expect(rich!.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 47 * 3_600_000);
    expect((await invitationService.getAllCodes()).map((c) => c.id)).toEqual(expect.arrayContaining([plain!.id, rich!.id]));
  });

  it("validates a code and reports remaining uses and the organisation", async () => {
    const org = await organizationService.createOrganization(`ValidateOrg-${Date.now()}`, admin);
    const code = await invitationService.generateCode({ createdBy: admin, maxUses: 3, organizationId: org.id });
    expect(await invitationService.validateCode(code!.code)).toMatchObject({
      valid: true,
      remainingUses: 3,
      organizationId: org.id,
      organizationName: org.name,
    });
  });

  it("refuses an empty, unknown, inactive, expired or exhausted code", async () => {
    await expect(invitationService.validateCode("  ")).rejects.toBeInstanceOf(BadRequestError);
    await expect(invitationService.validateCode("missing")).rejects.toBeInstanceOf(NotFoundError);

    const inactive = await invitationService.generateCode({ createdBy: admin });
    await invitationService.deactivateCode(inactive!.id);
    await expect(invitationService.validateCode(inactive!.code)).rejects.toBeInstanceOf(BadRequestError);

    const expired = await invitationService.generateCode({ createdBy: admin });
    await testDb.update(invitationCodes).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(invitationCodes.id, expired!.id));
    await expect(invitationService.validateCode(expired!.code)).rejects.toBeInstanceOf(BadRequestError);

    const exhausted = await invitationService.generateCode({ createdBy: admin });
    await testDb.update(invitationCodes).set({ usedCount: 1 }).where(eq(invitationCodes.id, exhausted!.id));
    await expect(invitationService.validateCode(exhausted!.code)).rejects.toBeInstanceOf(BadRequestError);
  });

  it("consumes a code once per user and records the usage", async () => {
    const code = await invitationService.generateCode({ createdBy: admin, maxUses: 2 });
    const first = await seed.createUser("First");
    const ext1 = await externalIdOf(first);
    await invitationService.consumeCode(code!.code, ext1, "f@x.io", "9.9.9.9");
    expect(await invitationRepository.hasUserUsedCode(ext1)).toBe(true);
    await expect(invitationService.consumeCode(code!.code, ext1, "f@x.io")).rejects.toBeInstanceOf(ConflictError);
    await expect(invitationService.consumeCode("unknown", "x", "x@x.io")).rejects.toBeInstanceOf(NotFoundError);

    const second = await seed.createUser("Second");
    await invitationService.consumeCode(code!.code, await externalIdOf(second), "s@x.io");
    const third = await seed.createUser("Third");
    await expect(invitationService.consumeCode(code!.code, await externalIdOf(third), "t@x.io")).rejects.toBeInstanceOf(BadRequestError);
  });

  it("refuses to consume an inactive or expired code", async () => {
    const user = await seed.createUser("Late");
    const ext = await externalIdOf(user);
    const inactive = await invitationService.generateCode({ createdBy: admin });
    await invitationService.deactivateCode(inactive!.id);
    await expect(invitationService.consumeCode(inactive!.code, ext, "l@x.io")).rejects.toBeInstanceOf(BadRequestError);
    const expired = await invitationService.generateCode({ createdBy: admin });
    await testDb.update(invitationCodes).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(invitationCodes.id, expired!.id));
    await expect(invitationService.consumeCode(expired!.code, ext, "l@x.io")).rejects.toBeInstanceOf(BadRequestError);
  });

  it("creates the app profile on consumption and joins the code's organisation", async () => {
    const org = await organizationService.createOrganization(`SignupOrg-${Date.now()}`, admin);
    const code = await invitationService.generateCode({ createdBy: admin, organizationId: org.id });
    const suffix = `signup-${Date.now()}`;
    const [auth] = await testDb
      .insert(authUser)
      .values({ id: `auth-${suffix}`, name: "New <b>Player</b>", email: `${suffix}@example.com`, emailVerified: true })
      .returning();

    const created = await invitationService.consumeCodeAndCreateAppUser(code!.code, auth!.id, auth!.email, "New <b>Player</b>");
    expect(created.role).toBe("player");
    expect(created.displayName).not.toContain("<");
    expect(await organizationRepository.isMember(org.id, created.id)).toBe(true);
    expect(await invitationRepository.getRedeemedOrganizationId(auth!.id)).toBe(org.id);
    expect((await testDb.select().from(appUsers).where(eq(appUsers.id, created.id))).length).toBe(1);
  });

  it("refuses to deactivate an unknown code", async () => {
    await expect(invitationService.deactivateCode(MISSING)).rejects.toBeInstanceOf(NotFoundError);
  });
});
