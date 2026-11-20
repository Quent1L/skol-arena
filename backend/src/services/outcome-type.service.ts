import { outcomeTypeRepository } from "../repository/outcome-type.repository";
import { disciplineRepository } from "../repository/discipline.repository";
import { type CreateOutcomeTypeInput, type UpdateOutcomeTypeInput } from "@skol-arena/shared/types/index";
import { ConflictError, ErrorCode, NotFoundError } from "../types/errors";

export class OutcomeTypeService {
  async createOutcomeType(input: CreateOutcomeTypeInput) {
    await this.validateDisciplineExists(input.disciplineId);
    if (input.isDefault) {
      await outcomeTypeRepository.resetDefault(input.disciplineId);
    }
    return await outcomeTypeRepository.create({
      disciplineId: input.disciplineId,
      name: input.name,
      isDefault: input.isDefault ?? false,
      scoreCountsForMmr: input.scoreCountsForMmr,
      mmrMultiplier: input.mmrMultiplier,
      points: input.points,
    });
  }

  async getOutcomeTypeById(id: string) {
    const outcomeType = await outcomeTypeRepository.getById(id);
    if (!outcomeType) {
      throw new NotFoundError(ErrorCode.OUTCOME_TYPE_NOT_FOUND);
    }
    return outcomeType;
  }

  async listOutcomeTypes(disciplineId?: string, includeArchived = false) {
    if (disciplineId) {
      await this.validateDisciplineExists(disciplineId);
    }
    return await outcomeTypeRepository.list(disciplineId, includeArchived);
  }

  async updateOutcomeType(id: string, input: UpdateOutcomeTypeInput) {
    const existing = await this.getOutcomeTypeById(id);
    const disciplineId = input.disciplineId ?? existing.disciplineId;
    if (input.disciplineId) {
      await this.validateDisciplineExists(input.disciplineId);
    }
    if (input.isDefault) {
      await outcomeTypeRepository.resetDefault(disciplineId);
    }
    return await outcomeTypeRepository.update(id, {
      disciplineId: input.disciplineId,
      name: input.name,
      isDefault: input.isDefault,
      scoreCountsForMmr: input.scoreCountsForMmr,
      mmrMultiplier: input.mmrMultiplier,
      points: input.points,
    });
  }

  /**
   * Hard delete, allowed only while no match was played under it. Its reasons
   * cascade away with it; a match referencing one of them blocks the delete
   * through the restrict on matches.outcome_reason_id.
   */
  async deleteOutcomeType(id: string) {
    await this.getOutcomeTypeById(id);

    const blockers = await outcomeTypeRepository.getDeletionBlockers(id);
    if (blockers.length > 0) {
      throw new ConflictError(ErrorCode.OUTCOME_TYPE_IN_USE, { blockers });
    }

    await outcomeTypeRepository.delete(id);
    return { success: true, message: "Outcome type deleted successfully" };
  }

  /**
   * Retires an outcome type without touching history: it stops being offered at
   * match entry, and every match already tagged with it keeps its points and its
   * MMR multiplier. Archiving also drops the default flag, since an archived
   * type must never be the one pre-selected on a new match.
   */
  async archiveOutcomeType(id: string, actorId: string) {
    const outcomeType = await this.getOutcomeTypeById(id);
    if (outcomeType.archivedAt) {
      throw new ConflictError(ErrorCode.OUTCOME_TYPE_ALREADY_ARCHIVED);
    }
    return await outcomeTypeRepository.archive(id, actorId);
  }

  async restoreOutcomeType(id: string) {
    const outcomeType = await this.getOutcomeTypeById(id);
    if (!outcomeType.archivedAt) {
      throw new ConflictError(ErrorCode.OUTCOME_TYPE_NOT_ARCHIVED);
    }
    return await outcomeTypeRepository.restore(id);
  }

  private async validateDisciplineExists(disciplineId: string) {
    const discipline = await disciplineRepository.getById(disciplineId);
    if (!discipline) {
      throw new NotFoundError(ErrorCode.DISCIPLINE_NOT_FOUND);
    }
  }
}

export const outcomeTypeService = new OutcomeTypeService();
