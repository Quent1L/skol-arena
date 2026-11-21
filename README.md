<div align="center">

# Skol Arena

**Skill Or Luck?** — an open-source platform for running persistent competitive communities.

[![Release](https://img.shields.io/github/v/release/Quent1L/skol-arena?label=release&color=8b5cf6)](https://github.com/Quent1L/skol-arena/releases)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Docker Pulls](https://img.shields.io/docker/pulls/quent1l/skol-arena)](https://hub.docker.com/r/quent1l/skol-arena)
[![Built with Bun](https://img.shields.io/badge/built%20with-Bun-f9f1e1)](https://bun.sh)

[Website](https://skol-arena.com) ·
[Features](https://skol-arena.com/features) ·
[Documentation](https://skol-arena.com/docs) ·
[Releases](https://github.com/Quent1L/skol-arena/releases) ·
[Docker Hub](https://hub.docker.com/r/quent1l/skol-arena)

</div>

<!-- TODO: add a screenshot or short GIF here (suggested path: docs/public/screenshots/hero.png) -->

## What is Skol Arena?

Skol Arena is an open-source platform for running persistent competitive communities.
Run championships, ranked ladders and elimination brackets while player profiles, rankings,
history and statistics stay in one place.

### More than a tournament bracket

Most tournament tools are built around a single event: an organizer sets everything up,
players show up, scores get entered, the event ends — and the history resets before the
next one.

Skol Arena is designed for communities that keep competing. Players play when they are
available, build a record over time, take part in seasons, and eventually meet in a final
bracket. Profiles, match history and standings stay put across events; a new ranked season
is the one thing you choose to reset — or carry over. It suits clubs, gaming communities,
companies, campuses and local groups that want to run competitions without relying on
spreadsheets and scattered tools.

It is **player-driven**: participants create and report their own matches, confirm or
contest results, and keep the competition moving without routing everything through one
person.

It is **self-hostable** and ships as a single Docker image holding the API, the built web
app and its database migrations. You bring a PostgreSQL database and nothing else. Your
data stays on your infrastructure.

## Features

One player base, three independent competition modes — run one, or all three side by side:

- **Championship** — flexible competitions that run over time. Persistent standings,
  configurable scoring, and fairness limits that stop a season-long championship from
  being gamed.
- **Bracket** — single or double elimination, losers bracket and bronze match. Draw at
  random, or seed the bracket from a finished championship's standings.
- **Ranked** — a continuous Elo-derivative MMR ladder with dynamic tiers, per-discipline
  team scoring, and instant feedback after every match.

Across every mode:

- **Player-driven match workflow** — create, report, confirm, correct, contest and cancel
  from the player side, with configurable validation levels per tournament.
- **Formats beyond 1v1** — solo, persistent team rosters, or teams assembled per match,
  with configurable team sizes.
- **Mobile-first and installable** — purpose-built mobile screens and a PWA, in French and
  English.
- **Access control** — native login or SSO through any OpenID Connect provider, invite-only registration, and
  organizations that scope a tournament to a group.

→ **[Full feature tour](https://skol-arena.com/features)**

## Getting started

### Run an instance

```bash
docker run -d \
  -p 3000:3000 \
  -e DATABASE_URL='postgres://user:password@host:5432/skol_arena' \
  -e BETTER_AUTH_SECRET='a-long-random-string' \
  -e BETTER_AUTH_URL='http://localhost:3000' \
  quent1l/skol-arena:latest
```

Migrations run automatically at startup, and an initial super-admin account is created on
the first boot against an empty database — its generated password is printed to the
container logs.

→ **[Docker Compose setup, reverse proxy and first-boot guide](https://skol-arena.com/docs/deployment)**

### Develop

**Prerequisites:** [Bun](https://bun.sh) 1.3+ and an empty PostgreSQL 16+ database, owned
by a role allowed to create tables. Create it yourself — the app never creates its own
database:

```bash
createdb skol_arena
```

```bash
git clone https://github.com/Quent1L/skol-arena.git
cd skol-arena
bun install

cp backend/.env.example backend/.env   # set DATABASE_URL and BETTER_AUTH_SECRET

bun run dev                            # start every workspace
```

There is no separate migration step: the backend applies every pending migration at
startup, so the first `bun run dev` creates the schema.

| Service | URL |
|---|---|
| Backend (Hono + Bun) | http://localhost:3000 |
| Frontend (Vue 3 + Vite) | http://localhost:5173 |
| Docs site (Astro) | http://localhost:4321 |

→ **[CONTRIBUTING.md](CONTRIBUTING.md)** has the full command reference, the architecture
and the conventions.

## Documentation

| | |
|---|---|
| [Website](https://skol-arena.com) | What Skol Arena is and why it exists |
| [Features](https://skol-arena.com/features) | The complete feature tour |
| [Self-hosting](https://skol-arena.com/docs) | Quick start and prerequisites |
| [Deployment](https://skol-arena.com/docs/deployment) | Docker image, Compose, first boot |
| [Environment variables](https://skol-arena.com/docs/environment-variables) | Every variable the app reads |
| [How it works](https://skol-arena.com/docs/matches) | Matches, disciplines, MMR, accounts |
| [API versioning](https://skol-arena.com/docs/api) | Header-based version negotiation |
| [Releases](https://github.com/Quent1L/skol-arena/releases) | Changelog for every version |
| [Docker Hub](https://hub.docker.com/r/quent1l/skol-arena) | Published images |

## Contributing

Issues and pull requests are open. It is a real project used by real leagues, and it gets
better fastest when the people running them say what is missing.

Commits must follow [Conventional Commits](https://www.conventionalcommits.org/) —
commitlint enforces it, and releases are derived from them. Before opening a pull request:

```bash
bun run lint && bun run type-check && bun run test:unit
```

Read **[CONTRIBUTING.md](CONTRIBUTING.md)** first. By participating you agree to the
[Code of Conduct](CODE_OF_CONDUCT.md). To report a vulnerability, see
[SECURITY.md](SECURITY.md) — please don't open a public issue for it.

## License

Skol Arena is licensed under the **[GNU Affero General Public License v3.0](LICENSE)**
(AGPL-3.0-only).

It is meant to be run by clubs, workplaces, bars and independent organizers on their own
hardware, with their own data. The AGPL keeps that true for everyone downstream: modify
it, deploy it, run it for your community — and if you offer it to others as a service, the
changes go back to the commons.

| You want to… | AGPL-3.0 |
|---|---|
| Run Skol Arena for your club, league, workplace or business — including commercially | ✅ Allowed |
| Modify the code and run your modified version | ✅ Allowed |
| Redistribute the source, or images you built yourself | ✅ Allowed — under AGPL-3.0, with the source |
| Offer a modified version as a hosted service (SaaS) | ✅ Allowed — you must offer that instance's users the complete corresponding source of your version (§13) |
| Keep your modifications private while serving them to third parties over a network | ❌ Not allowed |
| Ship Skol Arena inside a closed-source or proprietary product | ❌ Not allowed |
| Re-license the code under a permissive or proprietary license | ❌ Not allowed |
| Remove the copyright and license notices | ❌ Not allowed |

> This table is a plain-language summary, not legal advice. The [LICENSE](LICENSE) file is
> the only authoritative text.
