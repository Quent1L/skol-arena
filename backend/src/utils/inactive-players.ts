/**
 * Flags the rows of players who left the competition and moves them after the active
 * ones, keeping each group's order. Nothing else about a row changes: an inactive player
 * keeps the points or MMR they earned, they just no longer hold a position.
 */
export function partitionInactive<T extends object>(
  rows: readonly T[],
  inactiveIds: ReadonlySet<string>,
  idOf: (row: T) => string,
): T[] {
  if (inactiveIds.size === 0) return [...rows];
  const active: T[] = [];
  const inactive: T[] = [];
  for (const row of rows) {
    if (inactiveIds.has(idOf(row))) inactive.push({ ...row, inactive: true } as T);
    else active.push(row);
  }
  return [...active, ...inactive];
}
