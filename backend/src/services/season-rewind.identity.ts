/**
 * Repairing the names baked into a stored rewind.
 *
 * A rewind snapshots display names on purpose — it is never recomputed on read.
 * That makes it one more identity-denormalised cache: renaming a player, or
 * archiving them (which is a rename to `Archive N` plus the destruction of their
 * login), leaves the old name in every payload they appear in.
 *
 * The repair cannot be "regenerate": a rewind frozen at an older format must
 * keep that format. So instead of rebuilding a payload, this walks whatever
 * shape is stored and swaps the names in place. It only relies on identity refs
 * being `{ playerId, displayName, shortName }`, which is the one part of the
 * payload contract that has to stay stable across versions.
 */

export interface RewindIdentity {
  displayName: string;
  shortName: string;
}

/**
 * Swaps in the current names, in place, anywhere in `value`. Returns whether
 * anything actually changed, so an unaffected payload is never written back.
 */
export function retagIdentities(value: unknown, identities: Map<string, RewindIdentity>): boolean {
  if (Array.isArray(value)) {
    let changed = false;
    for (const item of value) {
      if (retagIdentities(item, identities)) changed = true;
    }
    return changed;
  }
  if (value === null || typeof value !== "object") return false;

  const record = value as Record<string, unknown>;
  let changed = applyIdentity(record, identities);
  for (const key of Object.keys(record)) {
    if (retagIdentities(record[key], identities)) changed = true;
  }
  return changed;
}

/**
 * A node is an identity ref when it carries a `playerId` we were asked about.
 * Names are only written where one already sits: a badge row also has a
 * `playerId`, and it has no business growing a display name.
 */
function applyIdentity(record: Record<string, unknown>, identities: Map<string, RewindIdentity>): boolean {
  const playerId = record.playerId;
  if (typeof playerId !== "string") return false;
  const identity = identities.get(playerId);
  if (!identity) return false;

  let changed = false;
  if (typeof record.displayName === "string" && record.displayName !== identity.displayName) {
    record.displayName = identity.displayName;
    changed = true;
  }
  if (typeof record.shortName === "string" && record.shortName !== identity.shortName) {
    record.shortName = identity.shortName;
    changed = true;
  }
  return changed;
}
