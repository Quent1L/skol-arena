/**
 * OpenID Connect sign-in providers, resolved from the environment.
 *
 *   OIDC_PROVIDERS=keycloak,authentik
 *   OIDC_KEYCLOAK_ISSUER=…  OIDC_KEYCLOAK_CLIENT_ID=…  OIDC_KEYCLOAK_CLIENT_SECRET=…
 *   OIDC_KEYCLOAK_LABEL=…   OIDC_KEYCLOAK_PKCE=false   (both optional)
 *
 * The id is what Better Auth stores as `account.providerId` and what the callback URL
 * ends with (`/api/auth/callback/<id>`), so renaming one detaches every account linked
 * through it.
 *
 * The single-provider `KEYCLOAK_*` variables predate this and still work: they declare
 * a provider with the id `keycloak`, which is the id the existing accounts carry.
 */

export interface OidcProvider {
  id: string;
  label: string | null;
  issuer: string;
  clientId: string;
  clientSecret: string;
  pkce: boolean;
  /** Declared through KEYCLOAK_*: the IdP still has the 1.6 callback URL registered. */
  legacy: boolean;
}

export interface ResolvedOidcProviders {
  providers: OidcProvider[];
  warnings: string[];
}

type Env = Record<string, string | undefined>;

const PROVIDER_ID = /^[a-z0-9][a-z0-9-]*$/;
/** Provider ids Better Auth already uses for something else. */
const RESERVED_IDS = new Set(["credential"]);

const filled = (value: string | undefined): string | undefined => (value?.trim() ? value.trim() : undefined);

/** `authentik-corp` → `OIDC_AUTHENTIK_CORP_`. */
export const oidcEnvPrefix = (id: string): string => `OIDC_${id.toUpperCase().replaceAll("-", "_")}_`;

function parseIds(raw: string | undefined): string[] {
  const ids = (raw ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  for (const id of ids) {
    if (!PROVIDER_ID.test(id) || RESERVED_IDS.has(id)) {
      throw new Error(
        `OIDC_CONFIG_ERROR: invalid provider id "${id}" in OIDC_PROVIDERS ` +
          `(lowercase letters, digits and dashes; "credential" is reserved)`,
      );
    }
  }
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate) throw new Error(`OIDC_CONFIG_ERROR: provider "${duplicate}" is listed twice in OIDC_PROVIDERS`);
  return ids;
}

function fromOidcVariables(id: string, env: Env): OidcProvider {
  const prefix = oidcEnvPrefix(id);
  const issuer = filled(env[`${prefix}ISSUER`]);
  const clientId = filled(env[`${prefix}CLIENT_ID`]);
  const clientSecret = filled(env[`${prefix}CLIENT_SECRET`]);
  if (!issuer || !clientId || !clientSecret) {
    throw new Error(
      `OIDC_CONFIG_ERROR: provider "${id}" needs ${prefix}ISSUER, ${prefix}CLIENT_ID and ${prefix}CLIENT_SECRET`,
    );
  }
  return {
    id,
    label: filled(env[`${prefix}LABEL`]) ?? null,
    issuer: issuer.replace(/\/+$/, ""),
    clientId,
    clientSecret,
    pkce: env[`${prefix}PKCE`] !== "false",
    legacy: false,
  };
}

function fromLegacyKeycloak(env: Env): OidcProvider | null {
  const issuer = filled(env.KEYCLOAK_ISSUER);
  const clientId = filled(env.KEYCLOAK_CLIENT_ID);
  const clientSecret = filled(env.KEYCLOAK_CLIENT_SECRET);
  if (!issuer || !clientId || !clientSecret) return null;
  return {
    id: "keycloak",
    label: filled(env.KEYCLOAK_LOGIN_LABEL) ?? null,
    issuer: issuer.replace(/\/+$/, ""),
    clientId,
    clientSecret,
    pkce: true,
    legacy: true,
  };
}

export function resolveOidcProviders(env: Env = process.env): ResolvedOidcProviders {
  const warnings: string[] = [];
  const providers = parseIds(env.OIDC_PROVIDERS).map((id) => fromOidcVariables(id, env));

  const legacy = fromLegacyKeycloak(env);
  if (legacy && providers.some((provider) => provider.id === "keycloak")) {
    warnings.push("KEYCLOAK_* is ignored: OIDC_PROVIDERS already declares a keycloak provider.");
  } else if (legacy) {
    warnings.push(
      "KEYCLOAK_* is deprecated: declare the provider with OIDC_PROVIDERS=keycloak and OIDC_KEYCLOAK_* instead.",
    );
    providers.push(legacy);
  }

  if (legacy && filled(env.KEYCLOAK_PKCE) !== undefined) {
    warnings.push("KEYCLOAK_PKCE is ignored: PKCE is always on for KEYCLOAK_* (Keycloak accepts it).");
  }

  return { providers, warnings };
}
