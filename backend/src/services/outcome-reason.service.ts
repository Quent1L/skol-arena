import { outcomeReasonRepository } from "../repository/outcome-reason.repository";
import { outcomeTypeRepository } from "../repository/outcome-type.repository";
import { type CreateOutcomeReasonInput, type UpdateOutcomeReasonInput } from "@skol-arena/shared/types/index";
import { ConflictError, ErrorCode, NotFoundError } from "../types/errors";

export class OutcomeReasonService {
  async createOutcomeReason(input: CreateOutcomeReasonInput) {
    await this.validateOutcomeTypeExists(input.outcomeTypeId);
    return await outcomeReasonRepository.create({
      outcomeTypeId: input.outcomeTypeId,
      name: input.name,
    });
  }

  async getOutcomeReasonById(id: string) {
    const outcomeReason = await outcomeReasonRepository.getById(id);
    if (!outcomeReason) {
      throw new NotFoundError(ErrorCode.OUTCOME_REASON_NOT_FOUND);
    }
    return outcomeReason;
  }

  async listOutcomeReasons(outcomeTypeId?: string) {
    if (outcomeTypeId) {
      await this.validateOutcomeTypeExists(outcomeTypeId);
    }
    return await outcomeReasonRepository.list(outcomeTypeId);
  }

  async updateOutcomeReason(id: string, input: UpdateOutcomeReasonInput) {
    await this.getOutcomeReasonById(id);
    if (input.outcomeTypeId) {
      await this.validateOutcomeTypeExists(input.outcomeTypeId);
    }
    return await outcomeReasonRepository.update(id, {
      outcomeTypeId: input.outcomeTypeId,
      name: input.name,
    });
  }

  async deleteOutcomeReason(id: string) {
    await this.getOutcomeReasonById(id);

    const blockers = await outcomeReasonRepository.getDeletionBlockers(id);
    if (blockers.length > 0) {
      throw new ConflictError(ErrorCode.OUTCOME_REASON_IN_USE, { blockers });
    }

    await outcomeReasonRepository.delete(id);
    return { success: true, message: "Outcome reason deleted successfully" };
  }

  private async validateOutcomeTypeExists(outcomeTypeId: string) {
    const outcomeType = await outcomeTypeRepository.getById(outcomeTypeId);
    if (!outcomeType) {
      throw new NotFoundError(ErrorCode.OUTCOME_TYPE_NOT_FOUND);
    }
  }
}

export const outcomeReasonService = new OutcomeReasonService();
