import { eq } from "drizzle-orm";
import { db } from "../config/database";
import { gameRules } from "../db/schema";

export interface CreateGameRuleData {
  title: string;
  content: string;
  createdBy: string;
}

export interface UpdateGameRuleData {
  title?: string;
  content?: string;
}

export class GameRulesRepository {
  async create(data: CreateGameRuleData) {
    const [rule] = await db.insert(gameRules).values(data).returning();
    return rule;
  }

  async getById(id: string) {
    return await db.query.gameRules.findFirst({
      where: eq(gameRules.id, id),
    });
  }

  async list() {
    return await db.query.gameRules.findMany({
      orderBy: (gameRules, { desc }) => [desc(gameRules.createdAt)],
    });
  }

  async update(id: string, data: UpdateGameRuleData) {
    const [updated] = await db.update(gameRules).set(data).where(eq(gameRules.id, id)).returning();
    return updated;
  }

  async delete(id: string) {
    await db.delete(gameRules).where(eq(gameRules.id, id));
  }
}

export const gameRulesRepository = new GameRulesRepository();
