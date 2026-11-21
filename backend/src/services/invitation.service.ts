import { invitationRepository } from "../repository/invitation.repository";
import { organizationRepository } from "../repository/organization.repository";
import { generatePassphrase } from "../utils/passphrase";
import { BadRequestError, ErrorCode, NotFoundError, ConflictError } from "../types/errors";
import { toSafeDisplayName } from "../utils/display-name";

/** Codes are stored lowercase; a code typed or pasted with capitals or spaces still matches. */
export function normalizeInvitationCode(code: string): string {
  return code.trim().toLowerCase();
}

/** A null maxUses never runs out. */
export function isInvitationExhausted(invitation: { maxUses: number | null; usedCount: number }): boolean {
  return invitation.maxUses !== null && invitation.usedCount >= invitation.maxUses;
}

export class InvitationService {
  async generateCode(data: {
    createdBy: string;
    code?: string;
    maxUses?: number | null;
    expiresInDays?: number;
    notes?: string;
    organizationId?: string;
  }) {
    const code = data.code ? await this.reserveCustomCode(data.code) : await this.freshPassphrase();
    const expiresAt = data.expiresInDays ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000) : null;

    return await invitationRepository.create({
      code,
      createdBy: data.createdBy,
      // null = unlimited; only an omitted value falls back to a single use
      maxUses: data.maxUses === undefined ? 1 : data.maxUses,
      expiresAt,
      notes: data.notes ?? null,
      organizationId: data.organizationId ?? null,
    });
  }

  private async freshPassphrase(): Promise<string> {
    let code: string;
    do {
      code = generatePassphrase();
    } while (await invitationRepository.findByCode(code));
    return code;
  }

  private async reserveCustomCode(code: string): Promise<string> {
    const normalized = normalizeInvitationCode(code);
    if (await invitationRepository.findByCode(normalized)) {
      throw new ConflictError(ErrorCode.INVITATION_CODE_TAKEN);
    }
    return normalized;
  }

  async validateCode(code: string) {
    if (!code || code.trim().length === 0) {
      throw new BadRequestError(ErrorCode.INVITATION_CODE_REQUIRED);
    }

    const invitation = await invitationRepository.findByCode(normalizeInvitationCode(code));
    if (!invitation) {
      throw new NotFoundError(ErrorCode.INVITATION_CODE_INVALID);
    }
    if (!invitation.isActive) {
      throw new BadRequestError(ErrorCode.INVITATION_CODE_INACTIVE);
    }
    if (invitation.expiresAt && invitation.expiresAt < new Date()) {
      throw new BadRequestError(ErrorCode.INVITATION_CODE_EXPIRED);
    }
    if (isInvitationExhausted(invitation)) {
      throw new BadRequestError(ErrorCode.INVITATION_CODE_EXHAUSTED);
    }

    let organizationName: string | undefined;
    if (invitation.organizationId) {
      const org = await organizationRepository.findById(invitation.organizationId);
      organizationName = org?.name;
    }

    return {
      valid: true,
      remainingUses: invitation.maxUses === null ? null : invitation.maxUses - invitation.usedCount,
      organizationId: invitation.organizationId ?? undefined,
      organizationName,
    };
  }

  async consumeCode(code: string, userId: string, email: string, ipAddress?: string) {
    const invitation = await invitationRepository.findByCode(normalizeInvitationCode(code));
    if (!invitation) {
      throw new NotFoundError(ErrorCode.INVITATION_CODE_INVALID);
    }
    if (!invitation.isActive) {
      throw new BadRequestError(ErrorCode.INVITATION_CODE_INACTIVE);
    }
    if (invitation.expiresAt && invitation.expiresAt < new Date()) {
      throw new BadRequestError(ErrorCode.INVITATION_CODE_EXPIRED);
    }
    if (isInvitationExhausted(invitation)) {
      throw new BadRequestError(ErrorCode.INVITATION_CODE_EXHAUSTED);
    }

    const hasUsed = await invitationRepository.hasUserUsedCode(userId);
    if (hasUsed) {
      throw new ConflictError(ErrorCode.INVITATION_CODE_ALREADY_USED);
    }

    if (!(await invitationRepository.claimUse(invitation.id))) {
      throw new BadRequestError(ErrorCode.INVITATION_CODE_EXHAUSTED);
    }
    await invitationRepository.recordUsage({
      codeId: invitation.id,
      userId,
      email,
      ipAddress: ipAddress ?? null,
    });

    return invitation;
  }

  async consumeCodeAndCreateAppUser(
    code: string,
    betterAuthUserId: string,
    email: string,
    displayName: string,
    ipAddress?: string,
  ) {
    const invitation = await this.consumeCode(code, betterAuthUserId, email, ipAddress);

    const { userRepository } = await import("../repository/user.repository");
    const safeName = toSafeDisplayName(displayName);
    const appUser = await userRepository.createAppUser({
      externalId: betterAuthUserId,
      displayName: safeName,
      shortName: safeName.substring(0, 5).toUpperCase(),
      role: "player",
    });

    if (invitation.organizationId) {
      await organizationRepository.addMember(invitation.organizationId, appUser.id, "member");
    }

    return appUser;
  }

  async getAllCodes() {
    return await invitationRepository.getAll();
  }

  async deactivateCode(codeId: string) {
    const code = await invitationRepository.findById(codeId);
    if (!code) {
      throw new NotFoundError(ErrorCode.INVITATION_CODE_NOT_FOUND);
    }
    return await invitationRepository.deactivate(codeId);
  }
}

export const invitationService = new InvitationService();
