import { BadRequestError, ErrorCode } from "../../types/errors";
import type { MatchStatus } from "@skol-arena/shared/types/index";

/**
 * Validator for match status transitions
 */
export class MatchStatusValidator {
    /**
     * Validate match status allows reporting
     */
    validateReportStatus(status: MatchStatus): void {
        // 'disputed' is included: re-reporting is how the author corrects a contested entry.
        if (!["scheduled", "reported", "disputed"].includes(status)) {
            throw new BadRequestError(ErrorCode.MATCH_INVALID_STATUS);
        }
    }

    /**
     * Validate match status allows confirmation
     */
    validateConfirmStatus(status: MatchStatus): void {
        // 'disputed' is included: a contester may accept after the discussion, which
        // withdraws their contestation and re-opens the validation round.
        if (!["reported", "disputed"].includes(status)) {
            throw new BadRequestError(ErrorCode.MATCH_INVALID_STATUS);
        }
    }

    /**
     * Validate match is not already finalized
     */
    validateNotFinalized(status: MatchStatus): void {
        if (status === "finalized") {
            throw new BadRequestError(ErrorCode.MATCH_ALREADY_FINALIZED);
        }
    }

    /**
     * Validate match is not confirmed (for updates/deletes)
     */
    validateNotConfirmed(status: MatchStatus): void {
        if (status === "confirmed") {
            throw new BadRequestError(ErrorCode.MATCH_ALREADY_CONFIRMED);
        }
    }

    /**
     * Validate match cannot be deleted
     */
    validateCanDelete(status: MatchStatus): void {
        if (status === "confirmed" || status === "finalized") {
            throw new BadRequestError(ErrorCode.MATCH_CANNOT_BE_DELETED);
        }
    }

    /**
     * Validate match carries a result that can be finalized
     */
    validateCanFinalize(status: MatchStatus): void {
        if (!["reported", "disputed", "confirmed", "pending_confirmation"].includes(status)) {
            throw new BadRequestError(ErrorCode.MATCH_INVALID_STATUS);
        }
    }

    /**
     * Validate match can be cancelled
     */
    validateCanCancel(status: MatchStatus): void {
        if (status === "finalized") {
            throw new BadRequestError(ErrorCode.MATCH_ALREADY_FINALIZED);
        }
        if (status === "cancelled") {
            throw new BadRequestError(ErrorCode.MATCH_CANNOT_BE_CANCELLED);
        }
    }
}

export const matchStatusValidator = new MatchStatusValidator();
