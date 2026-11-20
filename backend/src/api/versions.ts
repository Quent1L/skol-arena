/**
 * Major versions of the HTTP API, negotiated through the `accept-version` request
 * header. This is deliberately unrelated to the monorepo version in VERSION /
 * MIN_VERSION: a release may ship without touching the API contract, and an API
 * major may land while old clients keep talking to the version they were built
 * against.
 *
 * Adding a version means adding it here, adding its entry to VERSION_MOUNTS in
 * ./registry.ts, and moving LATEST_API_VERSION.
 */
export const API_VERSIONS = ["v1"] as const;

export type ApiVersion = (typeof API_VERSIONS)[number];

/** Served when the client sends no `accept-version` header. */
export const LATEST_API_VERSION: ApiVersion = "v1";

/** Response header carrying the version that was actually resolved. */
export const API_VERSION_RESPONSE_HEADER = "X-API-VERSION";

/** Request header a client uses to pin itself to a major version. */
export const API_VERSION_REQUEST_HEADER = "accept-version";

const BY_NAME = new Map<string, ApiVersion>(
  API_VERSIONS.flatMap((version) => [
    [version, version],
    [version.slice(1), version],
  ]),
);

/**
 * Resolves a raw header value to a supported version.
 *
 * Tolerates the spellings a client is likely to send by hand — "v1", "V1", "1",
 * with surrounding whitespace. Returns null for anything else, including an empty
 * header: an explicitly blank value is a client bug, not a request for the latest.
 */
export function normalizeVersion(raw: string): ApiVersion | null {
  return BY_NAME.get(raw.trim().toLowerCase()) ?? null;
}
