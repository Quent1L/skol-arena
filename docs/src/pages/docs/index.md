---
layout: ../../layouts/DocsLayout.astro
title: Self-Hosting
description: Run Skol Arena on your own infrastructure with Docker.
---

Skol Arena ships as a single Docker image containing the API, the built frontend,
and automatic database migrations. All you need is a PostgreSQL database.

## Just want to try it?

Two commands, no configuration. This starts the app and a Postgres database already
filled with players, disciplines, competitions and matches:

```bash
curl -O https://raw.githubusercontent.com/Quent1L/skol-arena/main/docker-compose.demo.yml
docker compose -f docker-compose.demo.yml up
```

Open `http://localhost:3000/login`. The super admin is `alex@skol.demo`;
the password is printed in the logs (`docker compose -f docker-compose.demo.yml logs app | grep "DEMO CREDENTIALS"`).
Wipe everything with `down -v`. This is for testing only — see
[Demo data](/docs/deployment#demo-data) for what is loaded and how it works.

## Quick start

```bash
docker run -d \
  --name skol-arena \
  -p 3000:3000 \
  -e DATABASE_URL="postgres://user:password@your-db-host:5432/skol_arena" \
  -e BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  quent1l/skol-arena:latest
```

On first boot the app runs its database migrations automatically, then creates an
initial super-admin account if the database is empty. Watch the container logs for
the generated password: it is regenerated and logged again on every restart until
that account logs in for the first time — see [Deployment](/docs/deployment) for
details.

Only two variables are truly required to get a working instance: `DATABASE_URL` and
`BETTER_AUTH_SECRET`. Everything else has a usable default — the image already
points `FRONTEND_BUILD_PATH` and `MIGRATIONS_FOLDER` at the bundled frontend build
and migrations, so a single container serves both the API and the web app.

## Where to go next

- **[Demo data](/docs/deployment#demo-data)** — try the app in two minutes with a
  pre-filled instance (`INIT_DEMO_DATA`).
- **[Environment Variables](/docs/environment-variables)** — every variable the app
  reads, what it configures, and whether it's required.
- **[Deployment](/docs/deployment)** — the full Docker Compose setup (app +
  Postgres), how migrations and the first admin account work, and notes on
  architecture support.

Once the instance is up, these pages cover how it behaves:

- **[Matches](/docs/matches)** — the player-driven match workflow, the four validation
  modes and the trust score, and the team formats a match can take.
- **[Disciplines & Scoring](/docs/disciplines)** — disciplines, outcome types and their
  weights, rules pages, and the contextual rules engine.
- **[MMR Rating](/docs/mmr)** — how ranked ratings are computed: the Elo formula,
  per-discipline sharing between teammates, season seeding and recalculation.
- **[Accounts & Access](/docs/accounts)** — authentication methods, invitation codes, and
  scoping tournaments to an organization.

## Prerequisites

- A PostgreSQL database (any recent version) reachable from the container.
- Docker (or a Docker-compatible runtime) able to pull from [Docker Hub](https://hub.docker.com/r/quent1l/skol-arena) .

## Resource requirements

Skol Arena is light: the API idles at roughly 100 MB of resident memory and near-zero CPU,
and the image itself is about 185 MB. The cheapest tier at any VPS provider, or a spare
x86 box, comfortably runs a club-sized instance. Published images are `linux/amd64` only —
on ARM, build from the `Dockerfile` first (see [Deployment](/docs/deployment)).

| Setup                                     | CPU    | RAM    | Disk  |
| ----------------------------------------- | ------ | ------ | ----- |
| App container only, Postgres hosted apart | 1 vCPU | 512 MB | 1 GB  |
| App + Postgres on the same host           | 2 vCPU | 2 GB   | 10 GB |

Bun grows its heap whenever the host has memory to spare, so on a tight box cap the
container (`mem_limit: 512m`, or `--memory 512m`) — it collects more eagerly instead of
drifting upward, rather than needing the extra RAM. Disk is dominated by the Postgres
volume: matches and standings are small text rows, so a season adds very little.

CPU only matters in bursts — bracket generation and a ranked season recalculation are the
heaviest operations, and both are short. Everything else is request-scoped.
