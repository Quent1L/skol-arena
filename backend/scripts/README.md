# Backend scripts

One-off scripts run with `bun run <script>` from `backend/`. They are not part of the
server build and are excluded from `tsconfig.json`'s `include`, so `bun run type-check`
does not cover them.

- `seed-ranked-matches.ts` — bulk match generator, documented below.
- `seed-e2e.ts` — fixtures for the Playwright suite. Run through `frontend`'s
  `bun run e2e:seed`, never directly.
- `seed-showcase.ts` — data for the docs screenshots. Run through `docs`'s
  `bun run shots:seed`. See `docs/screenshots/README.md`.

The showcase seed is built on the same blocks as the **demo data** — `src/demo/`, loaded
at server startup when `INIT_DEMO_DATA=true` on an empty database (see
`src/utils/init-demo-data.ts` and the Deployment docs). Those blocks live under `src/`
rather than here because the demo has to ship in the bundled server.

---

# Bulk match generator

`seed-ranked-matches.ts` fills an existing tournament with as many matches as you ask
for, spread over a date range you choose. It exists to make a ranked season that looks
played-in: a few thousand matches over several months, enough to exercise MMR, rank
tiers, leaderboards and the queries behind them.

Unlike the other two seeds, it talks to a **running server over HTTP** rather than to the
database. Every match therefore goes through the real validation chain, the ranked
auto-registration of players and the MMR hook — exactly what a client would trigger. A
match this script creates is indistinguishable from one somebody entered by hand.

## Before you run it

**Start the server with the reporting window disabled.** A ranked match must normally be
declared within 48 hours of being played, so a backfill is rejected outright. The window
is a server setting, not a script flag:

```sh
cd backend
RANKED_MATCH_MAX_AGE_HOURS=0 bun run dev
```

`0` turns the age check off; any other number sets the window in hours. It is read at
request time by `src/config/ranked.ts` and mirrored to the client through `GET /api/config`,
so the match form's date picker opens up too. See
[Environment variables](../../docs/src/pages/docs/environment-variables.md).

**Point it at a throwaway database.** The script writes hundreds of rows and there is no
undo. Prefer a scratch database over your dev one.

**The target tournament must:**

- exist and be `open` or `ongoing` — the server refuses matches on anything else;
- use `flex` team mode — the script draws from the player pool, and does not know how to
  pick static teams;
- have at least `2 × team-size` registered participants;
- ideally have `validationMode: "none"`, so the server finalizes each match on creation
  and computes MMR. With any other mode the matches are created but stay in `reported`
  until participants confirm them, and no MMR is computed. The script warns when it sees
  this.

**The account you sign in with** must be allowed to create matches in that tournament —
an organizer or an admin. It does not need to be one of the players.

## Usage

```sh
cd backend
bun run seed:matches --tournament <uuid> --count 500 \
  --from 2026-01-01 --to 2026-08-01 \
  --email admin@skol-arena.local --password '…'
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `--tournament <uuid>` | — (required) | Target tournament |
| `--count <n>` | `100` | How many matches to create |
| `--from <date>` | 30 days ago | Start of the `playedAt` range |
| `--to <date>` | now | End of the `playedAt` range |
| `--api <url>` | `$API_URL`, else `http://localhost:3000` | API base URL |
| `--email <email>` | `$SEED_API_EMAIL` | Account used to create the matches |
| `--password <pw>` | `$SEED_API_PASSWORD` | Its password |
| `--team-size <n>` | the tournament's `minTeamSize` | Players per side |
| `--seed <n>` | `1` | RNG seed — same seed, same matches |
| `--concurrency <n>` | `1` | Parallel creations (see below) |
| `--dry-run` | off | Print the payloads, create nothing |
| `--force` | off | Required when `--api` is not localhost |
| `--help` | — | Print the flag list |

Start with `--dry-run` and a small `--count`: it prints the first five payloads and exits
without writing anything.

```sh
bun run seed:matches --tournament <uuid> --count 5 --dry-run \
  --email admin@skol-arena.local --password '…'
```

Credentials can come from the environment instead of the command line, which keeps the
password out of your shell history:

```sh
export SEED_API_EMAIL=admin@skol-arena.local
export SEED_API_PASSWORD='…'
bun run seed:matches --tournament <uuid> --count 2000
```

## What it generates

Sides are drawn from `GET /tournaments/:id/participants` — the players actually registered
in the tournament — `team-size` per side, no player on both sides. Scores respect the
tournament's `minScore`/`maxScore` when scoring is enabled, and only come out level if the
tournament allows draws. When scoring is disabled, only a winner is set.

Dates are spread across `[--from, --to]`, jittered inside each slot and snapped to a whole
minute. The server rejects two matches that share a player within the same minute
(`PLAYER_SCHEDULE_CONFLICT`), so the script keeps a per-player register of booked minutes
and pushes a colliding match to the next free one.

Everything is driven by a seeded PRNG. Re-running with the same `--seed`, `--count` and
range regenerates the same matches, which makes a failure reproducible.

## MMR is computed off a serial queue — plan for it

**Read this before a run of more than a few hundred matches on a ranked season.**

Finalizing a match does not compute MMR inline. It enqueues a `finalize_match_mmr` job
on a graphile-worker queue named `mmr:<tournamentId>`. A named queue is processed
strictly one job at a time, on purpose: MMR has to be applied in order. There is no
parallelism to be had.

Each of those jobs replays every participant's history forward from the match's
`playedAt`, because a match reported late can change the standing of players who were
not in it. That is affordable when the queue keeps up with a handful of matches a day.
It is not affordable at scale: by the time the job for your oldest generated match runs,
the whole run is already in the database with later dates, so it replays thousands of
matches. Measured on a 51k-match season, jobs settled at roughly one every 15 seconds —
a queue that would take over a week to drain, and every real match entered meanwhile
sits behind it with no MMR animation.

Creating matches oldest-first does not avoid this. It only bounds how much work each job
does, and only while the worker keeps up. It does not change the result either way: the
job is a replay from a date, so it is order-independent.

**After a large run, do not wait for the queue.** Drop the backlog and replay the season
once — a single paged pass instead of tens of thousands of cascades, minutes instead of
days:

```sql
-- 1. Drop the queued per-match jobs (leave the one currently running).
DELETE FROM graphile_worker._private_jobs
WHERE task_id = (SELECT id FROM graphile_worker._private_tasks
                 WHERE identifier = 'finalize_match_mmr')
  AND locked_at IS NULL;
```

```sh
# 2. Replay the season in one pass. Same account as the seed run.
curl -X POST "$API/api/tournaments/<tournamentId>/recalculate-points" \
  -H 'accept-version: v1' -b cookies.txt
```

That endpoint runs `recalculateSeasonMmrDeterministic`, which wipes the season's
`mmr_history` and rebuilds it in one ordered pass, then resyncs animation events and the
ranked caches. Verify it landed — these two counts must be equal:

```sql
SELECT count(*) FROM mmr_history WHERE season_id = '<tournamentId>';

SELECT count(*) FROM matches m
  JOIN match_sides ms ON ms.match_id = m.id
  JOIN tournament_entry_players tep ON tep.entry_id = ms.entry_id
 WHERE m.status = 'finalized' AND m.tournament_id = '<tournamentId>';
```

The per-match MMR animations for the generated matches are lost by the purge. They are
synthetic matches nobody will watch; the standings, history and tiers are rebuilt exactly.

## Throughput

Sequential creation runs at roughly 150 ms per match against a local server on a
tournament that does not finalize — about 10 s for 60 matches, under 3 min for 1000.
`validationMode: "none"` adds finalization to each request, so expect slower.

`--concurrency` above 1 only speeds up the creation requests; it has no effect on the MMR
queue, which stays serial per season regardless.

## Output and failures

Progress is printed every 25 matches, then a total. A failed creation prints the HTTP
status, the error code and the server's message, and the run continues — one bad draw
should not throw away the rest. Ten consecutive failures abort the run instead, since that
means the configuration is wrong rather than the luck. The process exits non-zero if
anything failed.

Common ones:

| Error | Cause |
| --- | --- |
| `RANKED_MATCH_TOO_OLD` | The server was not started with `RANKED_MATCH_MAX_AGE_HOURS=0` |
| `INSUFFICIENT_PERMISSIONS` | The account cannot manage matches in that tournament |
| `TOURNAMENT_INVALID_STATUS` | The tournament is not `open` or `ongoing` |
| `PLAYER_SCHEDULE_CONFLICT` | Matches already in the tournament occupy the same minutes; widen the range |
