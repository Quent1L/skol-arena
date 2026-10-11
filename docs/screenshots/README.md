# Product screenshots

The landing page shows real screens of the running app, not mockups. This folder
holds the pipeline that produces them.

Output lands in `docs/src/assets/screenshots/` as `<screen>-desktop.png` and
`<screen>-mobile.png`, and is committed: the build must not need a database.

## Why a second database

The app renders genuinely different components below 768px, so every screen is
captured twice. It also needs data that looks like a competition somebody has
actually played, which the e2e fixtures deliberately are not. So this runs on its
own throwaway Postgres (port 5436, next to dev on 5432 and e2e on 5435) seeded by
`backend/scripts/seed-showcase.ts`.

That seed is deterministic: twelve players with fixed hidden skill ratings, a
seeded PRNG, and a frozen "today". Re-running it on an empty database reproduces
the same standings and the same ladder, so a re-capture only shows real UI
changes rather than churn.

## Avatars

Seven of the twelve players have a picture, the others keep their initials, so
the screenshots show both. The images are in `avatars/`, committed, and the seed
pushes them through the real upload pipeline (`avatarService.setAvatar`), so they
are resized and stored exactly as a player's own upload would be. The scripts pin
`AVATAR_STORAGE=postgres` so the seed and the backend read the same store whatever
`backend/.env` says.

They are [DiceBear](https://www.dicebear.com) "Lorelei" illustrations (CC0),
downloaded once from
`https://api.dicebear.com/9.x/lorelei/png?seed=<seed>&size=256&backgroundColor=c0aede,b6e3f4,d1d4f9,ffd5dc,ffdfbf&mouth=happy01,…,happy18`
with the player key as seed, except Nina (`nina-4`). Illustrations rather than
photos: the landing page is public, and nobody's face belongs on it by accident.

## Full run

Four commands, three terminals. From `docs/`:

```bash
bun run shots:reset        # wipes the database, recreates it, migrates, seeds
bun run shots:backend      # terminal 2: the API on :3000, against that database
```

The dev frontend hardcodes `http://localhost:3000`, so this backend has to own
that port: stop the normal dev stack first. Then, from `frontend/`:

```bash
bun run dev                # terminal 3
```

and back in `docs/`:

```bash
bun run shots:capture      # writes src/assets/screenshots/
```

`shots:reset` is the one to reach for. `shots:seed` on its own is idempotent and
does nothing on a database that already holds the showcase data, which is what you
want on a first run and never what you want on a second one.

Tear down with `bun run shots:db:down`.

## How reproducible it is

The data is: the seed draws from a fixed PRNG and a frozen "today", so the
standings, the MMR values and the tier boundaries come out identical every time.

The pixels are not, quite. Three things move between runs:

- the app picks its home-screen greeting at random ("Hi Theo!", "Back again,
  Theo!")
- the bracket is drawn with `seedingType: "random"`, so the matchups change
- matches still awaiting confirmation are stamped from the real clock, so their
  dates and deadlines follow the day you capture

Add the count-up animations on the MMR figures and two runs a minute apart can
differ by a few pixels. So re-capture when the UI changed, not to "refresh" the
files: a no-op re-capture still rewrites most of them.

## Re-capturing

Re-run the whole sequence whenever the app's UI changes in a way the landing page
claims. A partial re-capture is fine, but the desktop and mobile files of one
screen belong together: the page shows the phone inline and the desktop one in the
zoom view behind it.

## Screens

| File          | Route                              |
| ------------- | ---------------------------------- |
| `tournaments` | `/`                                |
| `standings`   | `/tournaments/<championship>/standings` |
| `ranked`      | `/tournaments/<season>/standings`  |
| `bracket`     | `/tournaments/<cup>/bracket`       |
| `player`      | `/players/<id>`                    |
| `match`       | `/matches/<id>` (awaiting confirmation) |
| `season-profile` | `/tournaments/<season>/stats?statsSub=profile` |
| `season-stats`   | `/tournaments/<season>/stats?statsSub=global`  |
