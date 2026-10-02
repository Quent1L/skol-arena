import { inArray, isNull, or, type AnyColumn, type SQL } from "drizzle-orm";

/** The same rule as a SQL condition on a tournament's organization column. */
export function organizationVisibilityCondition(
  organizationColumn: AnyColumn,
  visibleOrganizationIds: string[] | null,
): SQL | undefined {
  if (visibleOrganizationIds === null) return undefined;
  return visibleOrganizationIds.length > 0
    ? or(isNull(organizationColumn), inArray(organizationColumn, visibleOrganizationIds))
    : isNull(organizationColumn);
}
