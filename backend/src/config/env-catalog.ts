import type { EnvironmentVariable } from "@skol-arena/shared";

export type EnvGroup = "database" | "server" | "auth" | "smtp" | "push" | "avatars";

type EnvEntry = { name: string; group: EnvGroup; secret: boolean };

/**
 * Every variable the maintenance screen may show, mirroring
 * docs/src/pages/docs/environment-variables.md (a test keeps the two in step).
 *
 * An allowlist on purpose: a variable nobody listed is never exposed, and a secret
 * only ever reports whether it is set. Credentials embedded in a URL count as
 * secrets, hence DATABASE_URL.
 */
export const ENV_CATALOG: readonly EnvEntry[] = [
  { name: "DATABASE_URL", group: "database", secret: true },
  { name: "DATABASE_POOL_MAX", group: "database", secret: false },
  { name: "MIGRATIONS_FOLDER", group: "database", secret: false },
  { name: "NODE_ENV", group: "server", secret: false },
  { name: "PORT", group: "server", secret: false },
  { name: "FRONTEND_URL", group: "server", secret: false },
  { name: "FRONTEND_BUILD_PATH", group: "server", secret: false },
  { name: "LOG_LEVEL", group: "server", secret: false },
  { name: "LOG_FORMAT", group: "server", secret: false },
  { name: "APP_TIMEZONE", group: "server", secret: false },
  { name: "INITIAL_ADMIN_EMAIL", group: "server", secret: false },
  { name: "API_DOCS_ENABLED", group: "server", secret: false },
  { name: "RANKED_MATCH_MAX_AGE_HOURS", group: "server", secret: false },
  { name: "RATE_LIMIT_ENABLED", group: "server", secret: false },
  { name: "TRUSTED_PROXY_HOPS", group: "server", secret: false },
  { name: "BETTER_AUTH_SECRET", group: "auth", secret: true },
  { name: "BETTER_AUTH_URL", group: "auth", secret: false },
  { name: "BASE_URL", group: "auth", secret: false },
  { name: "SHOW_EMAIL_PASSWORD_FORM", group: "auth", secret: false },
  { name: "ENABLE_EMAIL_PASSWORD", group: "auth", secret: false },
  { name: "KEYCLOAK_CLIENT_ID", group: "auth", secret: false },
  { name: "KEYCLOAK_CLIENT_SECRET", group: "auth", secret: true },
  { name: "KEYCLOAK_ISSUER", group: "auth", secret: false },
  { name: "KEYCLOAK_PKCE", group: "auth", secret: false },
  { name: "KEYCLOAK_LOGIN_LABEL", group: "auth", secret: false },
  { name: "SMTP_HOST", group: "smtp", secret: false },
  { name: "SMTP_PORT", group: "smtp", secret: false },
  { name: "SMTP_SECURE", group: "smtp", secret: false },
  { name: "SMTP_USER", group: "smtp", secret: true },
  { name: "SMTP_PASSWORD", group: "smtp", secret: true },
  { name: "SMTP_FROM", group: "smtp", secret: false },
  { name: "SMTP_FROM_NAME", group: "smtp", secret: false },
  { name: "VAPID_PUBLIC_KEY", group: "push", secret: false },
  { name: "VAPID_PRIVATE_KEY", group: "push", secret: true },
  { name: "AVATAR_STORAGE", group: "avatars", secret: false },
  { name: "AVATAR_STORAGE_DIR", group: "avatars", secret: false },
  { name: "AVATAR_MAX_UPLOAD_BYTES", group: "avatars", secret: false },
];

/** The catalog resolved against `env`: values for public entries, a flag for secrets. */
export function describeEnvironment(env: Record<string, string | undefined> = process.env): EnvironmentVariable[] {
  return ENV_CATALOG.map(({ name, group, secret }) => {
    const raw = env[name];
    const configured = raw != null && raw !== "";
    return { name, group, secret, configured, value: secret || !configured ? null : raw };
  });
}
