import { organizationRepository } from "../repository/organization.repository";
import { invitationRepository } from "../repository/invitation.repository";
import { BadRequestError, ConflictError, ErrorCode, NotFoundError } from "../types/errors";

export class OrganizationService {
  async createOrganization(name: string, createdBy: string) {
    const org = await organizationRepository.create(name, createdBy);
    await organizationRepository.addMember(org.id, createdBy, "owner");
    return org;
  }

  async getAllOrganizations() {
    return await organizationRepository.getAll();
  }

  async joinViaCode(
    code: string,
    appUserId: string,
    betterAuthUserId: string,
    email: string,
    ipAddress?: string,
  ) {
    const invitation = await invitationRepository.findByCode(code);
    if (!invitation) {
      throw new NotFoundError(ErrorCode.INVITATION_CODE_INVALID);
    }
    if (!invitation.isActive) {
      throw new BadRequestError(ErrorCode.INVITATION_CODE_INACTIVE);
    }
    if (invitation.expiresAt && invitation.expiresAt < new Date()) {
      throw new BadRequestError(ErrorCode.INVITATION_CODE_EXPIRED);
    }
    if (invitation.usedCount >= invitation.maxUses) {
      throw new BadRequestError(ErrorCode.INVITATION_CODE_EXHAUSTED);
    }
    if (!invitation.organizationId) {
      throw new BadRequestError(ErrorCode.INVITATION_CODE_NOT_FOR_ORGANIZATION);
    }

    const alreadyMember = await organizationRepository.isMember(
      invitation.organizationId,
      appUserId,
    );
    if (alreadyMember) {
      throw new ConflictError(ErrorCode.ORGANIZATION_ALREADY_MEMBER);
    }

    if (!(await invitationRepository.claimUse(invitation.id))) {
      throw new BadRequestError(ErrorCode.INVITATION_CODE_EXHAUSTED);
    }
    await invitationRepository.recordUsage({
      codeId: invitation.id,
      userId: betterAuthUserId,
      email,
      ipAddress: ipAddress ?? null,
    });
    await organizationRepository.addMember(invitation.organizationId, appUserId, "member");

    const org = await organizationRepository.findById(invitation.organizationId);
    return { organizationName: org!.name };
  }

  async getMembers(orgId: string) {
    const org = await organizationRepository.findById(orgId);
    if (!org) throw new NotFoundError(ErrorCode.ORGANIZATION_NOT_FOUND);
    return await organizationRepository.getMembers(orgId);
  }

  async addMemberDirect(orgId: string, userId: string) {
    const org = await organizationRepository.findById(orgId);
    if (!org) throw new NotFoundError(ErrorCode.ORGANIZATION_NOT_FOUND);
    if (await organizationRepository.isMember(orgId, userId)) throw new ConflictError(ErrorCode.ORGANIZATION_ALREADY_MEMBER);
    await organizationRepository.addMember(orgId, userId, "member");
  }

  async removeMember(orgId: string, userId: string) {
    const org = await organizationRepository.findById(orgId);
    if (!org) throw new NotFoundError(ErrorCode.ORGANIZATION_NOT_FOUND);
    const removed = await organizationRepository.removeMember(orgId, userId);
    if (!removed) throw new NotFoundError(ErrorCode.ORGANIZATION_MEMBER_NOT_FOUND);
  }

  async renameOrganization(id: string, name: string) {
    const updated = await organizationRepository.rename(id, name);
    if (!updated) throw new NotFoundError(ErrorCode.ORGANIZATION_NOT_FOUND);
    return updated;
  }

  async isUserAuthorizedForTournament(
    tournamentOrganizationId: string | null | undefined,
    appUserId: string,
  ): Promise<boolean> {
    if (!tournamentOrganizationId) return true;
    return await organizationRepository.isMember(tournamentOrganizationId, appUserId);
  }
}

export const organizationService = new OrganizationService();
