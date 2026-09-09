import { gameRulesRepository } from "../repository/game-rules.repository";
import { userRepository } from "../repository/user.repository";
import type {
  CreateGameRuleData,
  UpdateGameRuleData,
} from "../repository/game-rules.repository";
import {
  ErrorCode,
  NotFoundError,
  ForbiddenError,
} from "../types/errors";

export class GameRulesService {
  async createGameRule(input: CreateGameRuleData) {
    await this.assertCanManage(input.createdBy);
    return await gameRulesRepository.create(input);
  }

  async getGameRuleById(id: string) {
    const rule = await gameRulesRepository.getById(id);
    if (!rule) {
      throw new NotFoundError(ErrorCode.GAME_RULE_NOT_FOUND);
    }
    return rule;
  }

  async listGameRules() {
    return await gameRulesRepository.list();
  }

  async updateGameRule(id: string, userId: string, input: UpdateGameRuleData) {
    await this.assertCanManage(userId);
    await this.getGameRuleById(id);
    return await gameRulesRepository.update(id, input);
  }

  async deleteGameRule(id: string, userId: string) {
    await this.assertCanManage(userId);
    await this.getGameRuleById(id);
    await gameRulesRepository.delete(id);
  }

  private async assertCanManage(userId: string) {
    const user = await userRepository.getById(userId);
    if (!user) {
      throw new ForbiddenError(ErrorCode.FORBIDDEN);
    }
    if (user.role !== "super_admin" && user.role !== "tournament_admin") {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS);
    }
  }
}

export const gameRulesService = new GameRulesService();
