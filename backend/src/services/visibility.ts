import { userRepository } from "../repository/user.repository";
import { organizationRepository } from "../repository/organization.repository";

/**
 * Which organizations a caller may see competitions from. null lifts the restriction
 * (super admins); an empty array leaves only the competitions attached to none.
 */
export async function visibleOrganizationIdsFor(viewerId: string | null): Promise<string[] | null> {
  if (!viewerId) return [];

  const viewer = await userRepository.getById(viewerId);
  if (viewer?.role === "super_admin") return null;

  return await organizationRepository.getUserOrganizationIds(viewerId);
}

/** The same rule for a row already in memory. */
export function isOrganizationVisible(
  organizationId: string | null | undefined,
  visibleOrganizationIds: string[] | null,
): boolean {
  if (!organizationId || visibleOrganizationIds === null) return true;
  return visibleOrganizationIds.includes(organizationId);
}
