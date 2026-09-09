---
layout: ../../layouts/DocsLayout.astro
title: Environment Variables
description: Every environment variable Skol Arena reads, grouped by purpose.
---

Skol Arena has no central env-validation file — every variable below is read
directly where it's needed. This page is the canonical reference.

## Database & migrations

| Variable            | Purpose                                                                                                                           | Required | Default                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------- |
| `DATABASE_URL`      | PostgreSQL connection string. Used by the app's connection pool, Better Auth, the Drizzle migrator, and the background job queue. | **Yes**  | —                                        |
| `DATABASE_POOL_MAX` | Maximum connections in the pool.                                                                                                  | No       | `10`                                     |
| `MIGRATIONS_FOLDER` | Path to the Drizzle migrations directory.                                                                                         | No       | `./drizzle` (preset in the Docker image) |

Migrations run automatically, synchronously, at server startup — before any
traffic is accepted. There is no manual migrate command. If a migration fails,
the process exits immediately (useful for container orchestrators to detect a
bad deploy).

## Server & runtime

| Variable                     | Purpose                                                                                                                                                                                                                 | Required | Default                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------- |
| `NODE_ENV`                   | Standard Node environment flag; affects CORS origin behavior.                                                                                                                                                           | No       | dev behavior if unset                             |
| `PORT`                       | Port the server listens on.                                                                                                                                                                                             | No       | `3000`                                            |
| `FRONTEND_URL`               | Allowed CORS origin and Better Auth trusted origin for the frontend.                                                                                                                                                    | No       | `http://localhost:5173`                           |
| `FRONTEND_BUILD_PATH`        | Single-container mode: serves the built frontend (static assets + SPA fallback) from this path. Set to an empty value to serve the API only.                                                                            | No       | unset outside Docker (preset in the image)        |
| `LOG_LEVEL`                  | Pino log level.                                                                                                                                                                                                         | No       | `info`                                            |
| `LOG_FORMAT`                 | Log output format: `json` or `logfmt`.                                                                                                                                                                                  | No       | `json`                                            |
| `APP_TIMEZONE`               | Timezone used for time-of-day/day-of-week logic in the contextual rules engine.                                                                                                                                         | No       | `Europe/Paris`                                    |
| `INITIAL_ADMIN_EMAIL`        | Email address for the auto-created super-admin account. Its password is regenerated and logged on every startup until that account logs in once.                                                                        | No       | `admin@skol-arena.local`                          |
| `API_DOCS_ENABLED`           | Serves the OpenAPI documents and the Scalar reference at `/api/docs`. Set to `"false"` to switch them off. See [API versioning](/docs/api).                                                                             | No       | on in development, off when `NODE_ENV=production` |
| `RANKED_MATCH_MAX_AGE_HOURS` | How long after being played a ranked match can still be declared, in hours. `0` turns the check off — a test/backfill setting, not something to run in production. Invalid values fall back to the default.             | No       | `48`                                              |
| `RATE_LIMIT_ENABLED`         | Arms request rate limiting — the sign-in/sign-up/password-reset limits and the public business endpoints. Set to `"true"` to exercise it outside production, `"false"` if you rate limit at your reverse proxy instead. | No       | on when `NODE_ENV=production`, off otherwise      |

## Authentication (Better Auth)

| Variable                   | Purpose                                                                                                                                         | Required                                                                | Default                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------ |
| `BETTER_AUTH_SECRET`       | Signing secret for sessions and cookies.                                                                                                        | **Yes**                                                                 | —                                                      |
| `BETTER_AUTH_URL`          | Better Auth's own base URL; also added as a trusted origin.                                                                                     | No                                                                      | falls back to `BASE_URL`, then `http://localhost:3000` |
| `BASE_URL`                 | Secondary fallback for the auth base URL.                                                                                                       | No                                                                      | `http://localhost:3000`                                |
| `SHOW_EMAIL_PASSWORD_FORM` | Shows/hides the email+password login form on the frontend (set to the literal string `"false"` to hide it). Frontend only — see the note below. | No                                                                      | shown                                                  |
| `ENABLE_EMAIL_PASSWORD`    | Deprecated name for `SHOW_EMAIL_PASSWORD_FORM`. Still read when the new name is unset, and warns at startup.                                    | No                                                                      | —                                                      |
| `KEYCLOAK_CLIENT_ID`       | Keycloak OAuth client ID.                                                                                                                       | No — but all three Keycloak variables are needed together to enable SSO | —                                                      |
| `KEYCLOAK_CLIENT_SECRET`   | Keycloak OAuth client secret.                                                                                                                   | No (see above)                                                          | —                                                      |
| `KEYCLOAK_ISSUER`          | Keycloak issuer URL (also used to derive the realm name shown on the login button).                                                             | No (see above)                                                          | —                                                      |
| `KEYCLOAK_PKCE`            | Enables PKCE for the Keycloak OAuth flow (literal `"true"` to enable).                                                                          | No                                                                      | disabled                                               |
| `KEYCLOAK_LOGIN_LABEL`     | Custom label for the Keycloak login button.                                                                                                     | No                                                                      | —                                                      |

At least one authentication method must be active: the app refuses to start if
`SHOW_EMAIL_PASSWORD_FORM` is disabled and Keycloak isn't fully configured.

> **`SHOW_EMAIL_PASSWORD_FORM=false` hides the form, it does not close the endpoint.**
> `POST /api/auth/sign-in/email` keeps accepting valid credentials. This is deliberate:
> it leaves administrators a way in when Keycloak is unreachable, which is exactly when
> you need one. If your threat model requires password sign-in to be genuinely
> unavailable, block the `/api/auth/sign-in/email` path at your reverse proxy — the
> variable will not do it for you. The old name, `ENABLE_EMAIL_PASSWORD`, claimed
> otherwise, which is why it was renamed.

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

## Real-time (WebSocket)

No dedicated variables. WebSocket connections are mounted on the same server
and port as the HTTP API, and authenticated using the existing Better Auth
session — nothing extra to configure.
