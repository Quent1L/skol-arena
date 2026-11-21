---
layout: ../../layouts/DocsLayout.astro
title: Environment Variables
description: Every environment variable Skol Arena reads, grouped by purpose.
---

Skol Arena has no central env-validation file — every variable below is read
directly where it's needed. This page is the canonical reference.

The values in effect on a running instance can be checked from **Admin → Technical
maintenance** — secrets only report whether they are set. See
[Technical maintenance](/docs/deployment#technical-maintenance).

## Database

| Variable            | Purpose                                                                                                                           | Required | Default |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- |
| `DATABASE_URL`      | PostgreSQL connection string. Used by the app's connection pool, Better Auth, the Drizzle migrator, and the background job queue. | **Yes**  | —       |
| `DATABASE_POOL_MAX` | Maximum connections in the pool.                                                                                                  | No       | `10`    |

Migrations run automatically, synchronously, at server startup — before any
traffic is accepted. There is no manual migrate command. If a migration fails,
the process exits immediately (useful for container orchestrators to detect a
bad deploy).

## Server & runtime

| Variable                     | Purpose                                                                                                                                                                                                                                                                                                                                                              | Required | Default                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------- |
| `NODE_ENV`                   | Preset to `production` in the Docker image — leave it. Production switches on rate limiting and turns off the API reference by default (see below). Only set otherwise when running from source.                                                                                                                                                                     | No       | `production` in the image                         |
| `PORT`                       | Port the server listens on.                                                                                                                                                                                                                                                                                                                                          | No       | `3000`                                            |
| `FRONTEND_URL`               | Origin of the frontend, for CORS and the Better Auth trusted origins. Only needed when the frontend is served from another origin than the app (see [Single-container frontend serving](/docs/deployment#single-container-frontend-serving)).                                                                                                                        | No       | `BETTER_AUTH_URL`, then `http://localhost:3000`   |
| `FRONTEND_BUILD_PATH`        | Single-container mode: serves the built frontend (static assets + SPA fallback) from this path. Set to an empty value to serve the API only.                                                                                                                                                                                                                         | No       | unset outside Docker (preset in the image)        |
| `LOG_LEVEL`                  | Pino log level.                                                                                                                                                                                                                                                                                                                                                      | No       | `info`                                            |
| `LOG_FORMAT`                 | Log output format: `pretty` (human-readable), `json` or `logfmt`. Pick `json` or `logfmt` if a log collector parses your logs.                                                                                                                                                                                                                                       | No       | `pretty`                                          |
| `APP_TIMEZONE`               | Timezone used for time-of-day/day-of-week logic in the contextual rules engine.                                                                                                                                                                                                                                                                                      | No       | `Europe/Paris`                                    |
| `INITIAL_ADMIN_EMAIL`        | Email address for the auto-created super-admin account. Its password is regenerated and logged on every startup until that account logs in once.                                                                                                                                                                                                                     | No       | `admin@skol-arena.local`                          |
| `INIT_DEMO_DATA`             | Set to `"true"` to load the demo data set — players, disciplines, competitions and matches — on first boot. Only applies to an empty database; ignored, with a log line, otherwise. See [Demo data](/docs/deployment#demo-data).                                                                                                                                     | No       | off                                               |
| `API_DOCS_ENABLED`           | Serves the OpenAPI documents and the Scalar reference at `/api/docs`. Set to `"false"` to switch them off. See [API versioning](/docs/api).                                                                                                                                                                                                                          | No       | on in development, off when `NODE_ENV=production` |
| `RANKED_MATCH_MAX_AGE_HOURS` | How long after being played a ranked match can still be declared, in hours. `0` turns the check off — a test/backfill setting, not something to run in production. Invalid values fall back to the default.                                                                                                                                                          | No       | `48`                                              |
| `RATE_LIMIT_ENABLED`         | Arms request rate limiting — the sign-in/sign-up/password-reset limits and the public business endpoints. Set to `"true"` to exercise it outside production, `"false"` if you rate limit at your reverse proxy instead.                                                                                                                                              | No       | on when `NODE_ENV=production`, off otherwise      |
| `TRUSTED_PROXY_HOPS`         | How many reverse proxies sit between your users and the app, which is what lets rate limiting tell callers apart. `0` means the app is reached directly and `x-forwarded-for` is ignored, since any caller can send one; `1` for a single reverse proxy, `2` for a CDN in front of it. Too high is safe — callers share a window; too low lets the limits be evaded. | No       | `0`                                               |

## Authentication (Better Auth)

| Variable                   | Purpose                                                                                                                                                                              | Required                      | Default                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | ------------------------------------------------------ |
| `BETTER_AUTH_SECRET`       | Signing secret for sessions and cookies.                                                                                                                                             | **Yes**                       | —                                                      |
| `BETTER_AUTH_URL`          | Better Auth's own base URL; also added as a trusted origin.                                                                                                                          | No                            | falls back to `BASE_URL`, then `http://localhost:3000` |
| `BASE_URL`                 | Secondary fallback for the auth base URL.                                                                                                                                            | No                            | `http://localhost:3000`                                |
| `SHOW_EMAIL_PASSWORD_FORM` | Shows/hides the email+password login form on the frontend (set to the literal string `"false"` to hide it). Frontend only — see the note below.                                      | No                            | shown                                                  |
| `ENABLE_EMAIL_PASSWORD`    | Deprecated name for `SHOW_EMAIL_PASSWORD_FORM`. Still read when the new name is unset, and warns at startup.                                                                         | No                            | —                                                      |
| `REQUIRE_INVITATION_CODE`  | Set to `"false"` to open sign-up to everyone: an invitation code becomes optional, and still works to join an organization. See [Invitation codes](/docs/accounts#invitation-codes). | No                            | required                                               |
| `OIDC_PROVIDERS`           | Comma-separated ids of the OpenID Connect providers to offer, e.g. `keycloak,authentik`. Lowercase letters, digits and dashes.                                                       | No                            | —                                                      |
| `OIDC_<ID>_ISSUER`         | Issuer URL of provider `<ID>` (the id upper-cased, dashes turned into underscores). Its `/.well-known/openid-configuration` must answer.                                             | Yes, for each listed provider | —                                                      |
| `OIDC_<ID>_CLIENT_ID`      | OAuth client ID registered for Skol Arena on that provider.                                                                                                                          | Yes, for each listed provider | —                                                      |
| `OIDC_<ID>_CLIENT_SECRET`  | OAuth client secret.                                                                                                                                                                 | Yes, for each listed provider | —                                                      |
| `OIDC_<ID>_LABEL`          | Label of that provider's login button.                                                                                                                                               | No                            | "Sign in with `<id>`"                                  |
| `OIDC_<ID>_PKCE`           | Set to the literal `"false"` for a provider that rejects PKCE.                                                                                                                       | No                            | enabled                                                |
| `KEYCLOAK_CLIENT_ID`       | Deprecated: the three `KEYCLOAK_*` variables declare a provider with the id `keycloak`. Still read, and warns at startup.                                                            | No                            | —                                                      |
| `KEYCLOAK_CLIENT_SECRET`   | Deprecated, see above.                                                                                                                                                               | No                            | —                                                      |
| `KEYCLOAK_ISSUER`          | Deprecated, see above.                                                                                                                                                               | No                            | —                                                      |
| `KEYCLOAK_PKCE`            | Ignored: PKCE is always on for a `KEYCLOAK_*` provider.                                                                                                                              | No                            | —                                                      |
| `KEYCLOAK_LOGIN_LABEL`     | Deprecated: label of the `keycloak` provider's button.                                                                                                                               | No                            | —                                                      |

At least one authentication method must be active: the app refuses to start if
`SHOW_EMAIL_PASSWORD_FORM` is disabled and no OpenID Connect provider is configured.
A listed provider with a missing variable stops the startup too.

Register this redirect URI on each provider, with your public URL in front:
`https://<your-domain>/api/auth/callback/<id>`, and `https://<your-domain>/login` as the
post-logout redirect URI. An install configured through `KEYCLOAK_*` keeps the redirect
URI it registered before (`/api/auth/oauth2/callback/keycloak`): it still works, nothing
needs changing on the Keycloak side. Moving to `OIDC_KEYCLOAK_*` switches it to the new
URI. Keep the id `keycloak` when you do: accounts are linked to the provider id.

> **`SHOW_EMAIL_PASSWORD_FORM=false` hides the form, it does not close the endpoint.**
> `POST /api/auth/sign-in/email` keeps accepting valid credentials. This is deliberate:
> it leaves administrators a way in when the SSO provider is unreachable, which is exactly
> when you need one. Two ways bring the form back:
>
> - open `/login?native=true` directly;
> - or click **Sign in** in the top bar five times in a row (within three seconds) —
>   handy in the installed app, which has no address bar.
>
> If your threat model requires password sign-in to be genuinely unavailable, block the
> `/api/auth/sign-in/email` path at your reverse proxy — the variable will not do it for you.

## Email (SMTP)

Used for transactional email such as password resets.

| Variable         | Purpose                                             | Required               | Default |
| ---------------- | --------------------------------------------------- | ---------------------- | ------- |
| `SMTP_HOST`      | SMTP server host.                                   | Yes, for email to work | —       |
| `SMTP_PORT`      | SMTP server port.                                   | No                     | `587`   |
| `SMTP_SECURE`    | Use TLS (typically `"true"` for port 465).          | No                     | `false` |
| `SMTP_USER`      | SMTP auth username. Omit for a server without AUTH. | No                     | —       |
| `SMTP_PASSWORD`  | SMTP auth password.                                 | No                     | —       |
| `SMTP_FROM`      | "From" email address.                               | Yes, for email to work | —       |
| `SMTP_FROM_NAME` | Display name in the "From" header.                  | No                     | —       |

If these are left unset, the app still starts fine — email sending will simply
fail when triggered (e.g. a password-reset request). The server checks the SMTP
connection at startup and logs a warning when it is unreachable.

With a local mail catcher (maildev, mailpit…), set `SMTP_HOST=127.0.0.1` rather
than `localhost`: the latter resolves to `::1` first while those tools bind IPv4
only, which yields `connect ECONNREFUSED ::1:<port>`.

## Web push notifications (VAPID)

| Variable            | Purpose                                          | Required                                                | Default |
| ------------------- | ------------------------------------------------ | ------------------------------------------------------- | ------- |
| `VAPID_PUBLIC_KEY`  | VAPID public key for browser push notifications. | No — push is silently disabled unless both keys are set | —       |
| `VAPID_PRIVATE_KEY` | VAPID private key.                               | No (see above)                                          | —       |

Generate the pair once, with the `web-push` CLI (any machine with Node or Bun):

```bash
npx web-push generate-vapid-keys
# or: bunx web-push generate-vapid-keys
```

Keep the same pair for the life of the instance: changing it invalidates every existing
browser subscription, and players have to turn notifications back on.

## Avatars

| Variable                  | Purpose                                                                                                                   | Required | Default                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------- |
| `AVATAR_STORAGE`          | Where player avatars are kept: `postgres` or `filesystem`. An unknown value logs a warning and falls back to the default. | No       | `postgres`                                      |
| `AVATAR_STORAGE_DIR`      | Directory used by the `filesystem` storage. Must be writable by the app; the server refuses to start otherwise.           | No       | `./data/avatars` (`/data/avatars` in the image) |
| `AVATAR_MAX_UPLOAD_BYTES` | Largest upload accepted, in bytes. Larger requests are cut off before being read.                                         | No       | `5242880` (5 MB)                                |

Uploaded pictures are never stored as sent: the server decodes them, checks they
really are JPEG, PNG or WebP images, and keeps only three re-encoded WebP variants
(64, 128 and 256 px), a few kilobytes each. Every new avatar gets a new random URL,
so browsers cache each image for 30 days; past that they revalidate it, and an avatar
that has since been replaced or removed drops out of their cache.

**`postgres`** needs nothing extra and is covered by your `pg_dump` backups, but
every avatar lives in the database: with many players it grows the database and its
backups. **`filesystem`** keeps the database lean, at the cost of a volume to mount
and to back up separately — see [Deployment](/docs/deployment#avatar-storage).

Switching from one to the other does not move existing avatars by itself: until they
are migrated, players who had one fall back to their initials. The migration is one
click in **Admin → Technical maintenance** — see
[Deployment](/docs/deployment#switching-avatar-storage).

## Real-time (WebSocket)

No dedicated variables. WebSocket connections are mounted on the same server
and port as the HTTP API, and authenticated using the existing Better Auth
session — nothing extra to configure.

**Your reverse proxy has to let them through**, on `/api/ws`. Live updates (match
confirmations, notifications, the activity feed) travel over a long-lived WebSocket; a
proxy that does not forward the `Upgrade` handshake refuses it, and one that keeps its
default idle timeout (60 s on nginx) cuts it over and over — the app reconnects, but
updates stall in between. With nginx:

```nginx
location /api/ws {
    proxy_pass http://skol-arena:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 1h;
    proxy_send_timeout 1h;
}
```

Traefik and Caddy forward WebSockets out of the box; check the idle/read timeout of any
load balancer in front (AWS ALB, Cloudflare…) instead.
