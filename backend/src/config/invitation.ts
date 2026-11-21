/**
 * Whether a new account needs an invitation code to get in. On by default: an
 * instance is invite-only unless its operator opens it with REQUIRE_INVITATION_CODE=false.
 * Codes keep working when it is off, to join an organization at sign-up.
 */
export function isInvitationCodeRequired(): boolean {
  return process.env.REQUIRE_INVITATION_CODE !== "false";
}
