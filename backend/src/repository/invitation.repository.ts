import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../config/database";
import { invitationCodes, invitationUsages } from "../db/schema";

export class InvitationRepository {
  async findByCode(code: string) {
    return await db.query.invitationCodes.findFirst({
      where: eq(invitationCodes.code, code),
      with: { usages: true },
    });
  }

  async findById(id: string) {
    return await db.query.invitationCodes.findFirst({
      where: eq(invitationCodes.id, id),
      with: { usages: true },
    });
  }

  async create(data: typeof invitationCodes.$inferInsert) {
    const [code] = await db.insert(invitationCodes).values(data).returning();
    return code;
  }

  /**
   * Takes one use of the code, if it still has one. The check and the increment are a
   * single statement: checking first and incrementing after let parallel requests all
   * pass the check and use a single-use code several times. Returns false when the
   * code is exhausted, inactive or expired by the time the update runs.
   */
  async claimUse(codeId: string): Promise<boolean> {
    const updated = await db
      .update(invitationCodes)
      .set({ usedCount: sql`${invitationCodes.usedCount} + 1` })
      .where(
        and(
          eq(invitationCodes.id, codeId),
          eq(invitationCodes.isActive, true),
          lt(invitationCodes.usedCount, invitationCodes.maxUses),
          or(isNull(invitationCodes.expiresAt), gt(invitationCodes.expiresAt, new Date())),
        ),
      )
      .returning({ id: invitationCodes.id });
    return updated.length > 0;
  }

  async recordUsage(data: typeof invitationUsages.$inferInsert) {
    const [usage] = await db.insert(invitationUsages).values(data).returning();
    return usage;
  }

  async getAll() {
    return await db.query.invitationCodes.findMany({
      with: {
        creator: { columns: { id: true, displayName: true } },
        usages: { columns: { id: true, usedAt: true, email: true } },
      },
      orderBy: (codes, { desc }) => [desc(codes.createdAt)],
    });
  }

  async deactivate(codeId: string) {
    const [updated] = await db
      .update(invitationCodes)
      .set({ isActive: false })
      .where(eq(invitationCodes.id, codeId))
      .returning();
    return updated;
  }

  /** The organization of the first code this account redeemed, if it had one. */
  async getRedeemedOrganizationId(userId: string): Promise<string | null> {
    const usage = await db.query.invitationUsages.findFirst({
      where: eq(invitationUsages.userId, userId),
      with: { code: { columns: { organizationId: true } } },
    });
    return usage?.code?.organizationId ?? null;
  }

  async hasUserUsedCode(userId: string): Promise<boolean> {
    const usage = await db.query.invitationUsages.findFirst({
      where: eq(invitationUsages.userId, userId),
    });
    return !!usage;
  }
}

export const invitationRepository = new InvitationRepository();
