import { displayNameRegex } from "@skol-arena/shared";

const MIN_LENGTH = 3;
const MAX_LENGTH = 50;

/**
 * Turns the name an identity provider hands over into one the profile rules accept.
 * Sign-up and OAuth never ran the display name regex, so a name could carry markup
 * that ends up wherever the app renders it. The local part of an email is kept, every
 * other disallowed character is dropped, and a generated name covers what is left over.
 */
export function toSafeDisplayName(raw: string): string {
  const candidate = raw
    .split("@")[0]
    .replace(/[^\p{L}\d _-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LENGTH)
    .trim();

  if (candidate.length >= MIN_LENGTH && displayNameRegex.test(candidate)) {
    return candidate;
  }
  return `Player-${crypto.randomUUID().slice(0, 6)}`;
}
