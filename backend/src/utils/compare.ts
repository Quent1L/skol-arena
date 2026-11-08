/**
 * Three-way comparison by UTF-16 code unit, the order `<` gives. Unlike
 * `localeCompare` it does not depend on the host locale, so a tie-break on an id
 * resolves the same way on every machine.
 */
export function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}
