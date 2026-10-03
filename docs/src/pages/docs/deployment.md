---
layout: ../../layouts/DocsLayout.astro
title: Deployment
description: Docker image, Docker Compose setup, first boot, and platform notes.
---

## Docker image

Official images are published to Docker Hub:

```
quent1l/skol-arena:latest
quent1l/skol-arena:<version>   # e.g. 1.20.1
```

The image is built from the repository's multi-stage `Dockerfile`: it compiles the
shared types package, builds the Vue frontend, bundles the Bun backend, and copies
only the production artifacts into a minimal `oven/bun:1.4-slim` runtime running
as a non-root user.

**Platform note**: published images are currently `linux/amd64` only. If you're on
ARM (Raspberry Pi, or Apple Silicon without Rosetta-backed Docker Desktop), build
the image yourself from the `Dockerfile` at the repo root:

```bash
docker build -t skol-arena:local .
```

## Docker Compose

A minimal setup with Postgres alongside the app:

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: skol
      POSTGRES_PASSWORD: change-me
      POSTGRES_DB: skol_arena
    volumes:
      - skol-db-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U skol -d skol_arena']
      interval: 5s
      timeout: 5s
      retries: 10

  app:
    image: quent1l/skol-arena:latest
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    ports:
      - '3000:3000'
    environment:
      DATABASE_URL: postgres://skol:change-me@db:5432/skol_arena
      BETTER_AUTH_SECRET: change-me-to-a-long-random-string
      BETTER_AUTH_URL: http://localhost:3000

volumes:
  skol-db-data:
```

With the default settings the app has no other stateful dependency: avatars are
stored in Postgres, so no upload directory or extra volume is needed beyond the
Postgres data volume. To keep them out of the database instead, see
[Avatar storage](#avatar-storage).

The `healthcheck` and `condition: service_healthy` matter more than they look. A
plain `depends_on: - db` only waits for the database _container_ to start, not for
Postgres to accept connections — the app would then fail its startup migrations and,
under `restart: unless-stopped`, crash-loop until the database happens to be ready.

Add SMTP, VAPID, or Keycloak variables from the
[Environment Variables](/docs/environment-variables) reference as needed; none of
them are required to get a working instance running.

### Avatar storage

Player avatars are stored in Postgres by default. It is the simplest option, but
every picture then weighs on the database and on its dumps. To store them on disk
instead, switch `AVATAR_STORAGE` to `filesystem` and mount a volume on
`/data/avatars` — without one, every redeploy starts from an empty directory and
all avatars are lost:

```yaml
services:
  app:
    # …as above
    environment:
      AVATAR_STORAGE: filesystem
    volumes:
      - skol-avatars:/data/avatars

volumes:
  skol-db-data:
  skol-avatars:
```

The image creates `/data/avatars` owned by the app user, so a named volume
inherits the right permissions. A bind mount must be writable by uid `1001`; the
app refuses to start when the directory cannot be written to. With several
replicas, they must all share the same volume.

On an instance that already has avatars, changing `AVATAR_STORAGE` does not move
them by itself — follow [Switching avatar storage](#switching-avatar-storage).

### Switching avatar storage

Avatars can be moved from one storage to the other at any time:

1. Change `AVATAR_STORAGE` and restart. When going from `filesystem` to `postgres`,
   **keep the avatar volume mounted** at `AVATAR_STORAGE_DIR`: that is where the
   avatars are read back from.
2. On startup the server checks the other storage and logs a warning if it still
   holds avatars. The **Technical maintenance** card of the admin page shows the
   same warning.
3. Open **Admin → Technical maintenance** and click **Migrate**. Every current
   avatar is copied into the configured storage, verified, then deleted from the
   old one; orphaned old versions are purged once everything made it across.

The migration can be run again safely: an avatar that failed to copy keeps its
original and is retried. Once the warning is gone, the old volume can be removed.

## First boot

Two things happen automatically the first time the container starts against an
empty database:

1. **Migrations run.** The app applies all pending migrations before accepting any
   HTTP traffic, one transaction per migration. If one fails, the process exits —
   check the container logs and fix the underlying issue rather than retrying
   blindly. On a first boot against an empty database there is nothing to lose;
   on an upgrade there is, so read [Upgrading](#upgrading) before you pull a new
   tag.
2. **An initial super-admin account is created**, but only if the `appUsers` table
   is completely empty. The account email is `INITIAL_ADMIN_EMAIL` (defaults to
   `admin@skol-arena.local`), and a random password is generated and printed to
   the container logs:

   ```bash
   docker compose logs app | grep "INITIAL ADMIN CREDENTIALS"
   ```

   As long as that account has **never logged in**, a **new password is generated
   and logged on every restart**, and the previous one stops working. Missing the
   log line the first time is therefore harmless — restart the container and read
   the fresh password. Rotation stops permanently on the first successful login.

   Log in with the last logged email/password at `/login?native=true`, then change
   the password from the account settings. The generated password appears in
   cleartext in the logs, so treat those logs as a secret until you have replaced
   it.

## Accent-insensitive search (`unaccent`)

Player and user searches (the comparison page, the admin user list, the live player
picker) ignore case **and accents** — `eloise` finds `Éloïse` — through the PostgreSQL
[`unaccent`](https://www.postgresql.org/docs/current/unaccent.html) extension. A
migration creates it automatically.

This works out of the box with the Compose file above: the official `postgres` images
ship the contrib modules, and the `POSTGRES_USER` role owns the database. It can fail
elsewhere:

- the database role only owns a schema. `unaccent` is a trusted extension, so no
  superuser is needed, but creating it still requires `CREATE` **on the database**;
- the server was installed without the contrib modules (some distro packages split
  them into a separate `postgresql-contrib` package).

Neither case blocks the instance. The migration downgrades the error to a warning and
commits, and the app logs this at every startup:

```
PostgreSQL extension 'unaccent' unavailable — player/user search stays case-insensitive but accent-sensitive.
```

Search keeps working, only accent folding is lost. To enable it, have a privileged role
create the extension once, then restart the app:

```sql
CREATE EXTENSION IF NOT EXISTS unaccent;
-- or let the app's role do it itself on the next restart:
GRANT CREATE ON DATABASE skol_arena TO skol;
```

The check runs at startup only, so the restart is required. Searches done in the
browser (match entry, player filters) fold accents on their own and do not depend on
the extension.

## Upgrading

### Back up the database first

```bash
docker compose exec -T db pg_dump -U skol -Fc skol_arena > skol-$(date +%F).dump
```

Do this every time, before pulling a new tag. It is the only way back.

With `AVATAR_STORAGE=filesystem`, the dump does not contain the avatars: back up the
avatar volume as well.

### Why it matters

Migrations are applied **one transaction per migration**. A migration that fails
is rolled back whole, but the migrations that ran before it are already
committed, and they stay committed. The database is then somewhere between two
releases, and the log says so:

```
Migration failed. The migrations before it are committed and stay applied;
restoring the previous release requires a database backup.
```

The log line names the migration that failed, its position in the batch, and how
many were applied — start there.

Running the whole batch in a single transaction would avoid this, and that is
what the app used to do. It had to go: Postgres refuses to use an enum value
inside the same transaction that added it, which made a first boot from an empty
database impossible. Per-migration transactions are the price of being able to
create a new instance at all.

### Rolling back

There are no down-migrations. Going back to an earlier image means restoring the
dump:

```bash
docker compose stop app
docker compose exec -T db pg_restore -U skol -d skol_arena --clean --if-exists < skol-2026-08-23.dump
```

Then start the previous tag. This is true whether the upgrade failed halfway or
succeeded: a completed migration is not reversible either.

### Multiple replicas

Only one container migrates. The others block on a Postgres advisory lock until
it is done, then find nothing pending and carry on booting. Scaling the app
service during an upgrade is safe; two instances cannot interleave migrations.

## Technical maintenance

Super admins get a **Technical maintenance** card on the admin page. The screen
behind it gathers what you would otherwise dig out of the container and the
database:

- **Application**: the deployed version (flagged when the open tab still runs an
  older bundle, until it reloads), Bun version, `NODE_ENV`, when the process
  started, and the API versions served.
- **Database**: PostgreSQL version, total size, the ten largest tables (size and
  estimated row count), and how many migrations are applied.
- **Avatar storage**: the configured driver, where each current avatar actually
  is, how many are missing, and the migration button when some are left in the
  other storage — see [Switching avatar storage](#switching-avatar-storage).
- **Environment variables**: every variable listed in
  [Environment Variables](/docs/environment-variables), grouped the same way.
  Secrets (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `KEYCLOAK_CLIENT_SECRET`,
  `SMTP_USER`, `SMTP_PASSWORD`, `VAPID_PRIVATE_KEY`) only show whether they are
  set, never their value, and a variable not on that page is never shown.

The avatar storage check runs at startup, so the warning on the admin card costs
nothing; the detailed report is only computed when the screen is opened.

## Recovering a lost admin password

The rotation described above only covers accounts flagged as awaiting their first
login. Instances created **before** that behaviour existed are never flagged, so
they keep whatever password they already have — restarting them does not print a
new one.

If you are locked out — the initial password was lost and no other super-admin can
log in — re-arm the rotation by hand against the database:

```sql
UPDATE app_users SET bootstrap_pending = true WHERE role = 'super_admin';
```

Restart the container and read the new password from the logs, exactly as on a
first boot. The flag clears itself again on the next successful login.

This is deliberately a manual step. The app cannot tell an admin who has never
logged in from one who simply has not logged in recently — sessions expire and are
deleted — so automatically re-arming the rotation would invalidate working
passwords on healthy instances.

The same procedure works as a general admin password reset, for example if SSO
becomes unavailable and no local credentials are known.

## Single-container frontend serving

The image already points `FRONTEND_BUILD_PATH` at the frontend build it bundles, so
the backend serves the Vue app itself — static assets plus an SPA fallback to
`index.html` — and a single container on a single port covers both the API and the
web app. Nothing to configure.

Setting the variable to an empty value disables it: the container then only
exposes the API, and `/` returns a plain placeholder response. That is only
useful if you serve the frontend separately (a CDN or a reverse proxy), in which
case set `FRONTEND_URL` so CORS and the auth trusted origins allow it.
