import { disciplineRepository } from "../repository/discipline.repository";
import { type CreateDisciplineInput, type UpdateDisciplineInput } from "@skol-arena/shared/types/index";
import { ConflictError, ErrorCode, NotFoundError } from "../types/errors";

export class DisciplineService {
  async createDiscipline(input: CreateDisciplineInput) {
    return await disciplineRepository.create({
      name: input.name,
      icon: input.icon,
      scoreInstructions: input.scoreInstructions,
      teamInteractionMode: input.teamInteractionMode,
    });
  }

  async getDisciplineById(id: string) {
    const discipline = await disciplineRepository.getById(id);
    if (!discipline) {
      throw new NotFoundError(ErrorCode.DISCIPLINE_NOT_FOUND);
    }
    return discipline;
  }

  async listDisciplines(includeArchived = false) {
    return await disciplineRepository.list(includeArchived);
  }

  async updateDiscipline(id: string, input: UpdateDisciplineInput) {
    await this.getDisciplineById(id);
    return await disciplineRepository.update(id, {
      name: input.name,
      icon: input.icon,
      scoreInstructions: input.scoreInstructions,
      teamInteractionMode: input.teamInteractionMode,
    });
  }

  /**
   * Hard delete, allowed only while nothing depends on the discipline. Its
   * outcome types cascade away with it, which is the point: a discipline created
   * by mistake stays cheap to remove. As soon as a tournament, a rule or a match
   * references it, archiving is the only way out.
   */
  async deleteDiscipline(id: string) {
    await this.getDisciplineById(id);

    const blockers = await disciplineRepository.getDeletionBlockers(id);
    if (blockers.length > 0) {
      throw new ConflictError(ErrorCode.DISCIPLINE_IN_USE, { blockers });
    }

    await disciplineRepository.delete(id);
    return { success: true, message: "Discipline deleted successfully" };
  }

  /**
   * Non-destructive alternative to deletion: the discipline leaves every
   * selector while every competition played under it keeps resolving its
   * outcome types, and therefore its points and MMR.
   */
  async archiveDiscipline(id: string, actorId: string) {
    const discipline = await this.getDisciplineById(id);
    if (discipline.archivedAt) {
      throw new ConflictError(ErrorCode.DISCIPLINE_ALREADY_ARCHIVED);
    }
    return await disciplineRepository.archive(id, actorId);
  }

  async restoreDiscipline(id: string) {
    const discipline = await this.getDisciplineById(id);
    if (!discipline.archivedAt) {
      throw new ConflictError(ErrorCode.DISCIPLINE_NOT_ARCHIVED);
    }
    return await disciplineRepository.restore(id);
  }
}

export const disciplineService = new DisciplineService();
