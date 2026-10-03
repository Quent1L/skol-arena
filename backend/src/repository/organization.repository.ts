import { and, count, eq, sql } from "drizzle-orm";
import { db } from "../config/database";
import { organizations, organizationMembers } from "../db/schema";
import type { OrganizationMemberWithUser } from "@skol-arena/shared";

export class OrganizationRepository {
  async create(name: string, createdBy: string) {
    const [org] = await db.insert(organizations).values({ name, createdBy }).returning();
    return org;
  }

  async findById(id: string) {
    return await db.query.organizations.findFirst({
      where: eq(organizations.id, id),
    });
  }

  async getAll() {
    const result = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        createdBy: organizations.createdBy,
        createdAt: organizations.createdAt,
        memberCount: count(organizationMembers.id),
      })
      .from(organizations)
      .leftJoin(organizationMembers, eq(organizationMembers.organizationId, organizations.id))
      .groupBy(organizations.id)
      .orderBy(organizations.createdAt);

    return result;
  }

  async addMember(organizationId: string, userId: string, role: "owner" | "member" = "member") {
    await db.insert(organizationMembers).values({ organizationId, userId, role });
  }

  async isMember(organizationId: string, userId: string): Promise<boolean> {
    const membership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId),
      ),
    });
    return !!membership;
  }

  /** True when `ownerId` owns at least one organization `memberId` belongs to. */
  async isOwnerOfSharedOrganization(ownerId: string, memberId: string): Promise<boolean> {
    const [row] = await db
      .select({ found: sql<number>`1` })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.userId, ownerId),
          eq(organizationMembers.role, "owner"),
          sql`EXISTS (
            SELECT 1 FROM ${organizationMembers} AS target
            WHERE target.organization_id = ${organizationMembers.organizationId}
              AND target.user_id = ${memberId}
          )`,
        ),
      )
      .limit(1);
    return !!row;
  }

  async getUserOrganizationIds(userId: string): Promise<string[]> {
    const memberships = await db.query.organizationMembers.findMany({
      where: eq(organizationMembers.userId, userId),
      columns: { organizationId: true },
    });
    return memberships.map((m) => m.organizationId);
  }

  async getMembers(organizationId: string): Promise<OrganizationMemberWithUser[]> {
    const members = await db.query.organizationMembers.findMany({
      where: eq(organizationMembers.organizationId, organizationId),
      with: {
        user: { columns: { id: true, displayName: true, shortName: true, role: true } },
      },
      orderBy: (m, { asc }) => [asc(m.joinedAt)],
    });
    return members.map((m) => ({ ...m, joinedAt: m.joinedAt.toISOString() }));
  }

  async removeMember(organizationId: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)))
      .returning({ id: organizationMembers.id });
    return result.length > 0;
  }

  async rename(id: string, name: string) {
    const [updated] = await db.update(organizations).set({ name }).where(eq(organizations.id, id)).returning();
    return updated;
  }
}

export const organizationRepository = new OrganizationRepository();
