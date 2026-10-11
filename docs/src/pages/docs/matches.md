---
layout: ../../layouts/DocsLayout.astro
title: Matches
description: How a match is created, reported, validated and disputed — and the team formats it can take.
---

A match is the unit every competition mode is built on. Players create it, report it and
settle it between themselves; the tournament only steps in when they disagree.

## Player-driven match workflow

The day-to-day of a competition runs on the players themselves. Anyone taking part in a
match can act on it directly:

- **Create a match** — a player sets up a match they're playing in. No admin step, no
  pre-generated schedule to wait for.
- **Report the result** — the participants report the score. Reporting is restricted to the
  players actually in the match, so results always trace back to someone involved.
- **Confirm or contest** — the opposing side can confirm the report to finalize it early, or
  contest it. A contested match is marked disputed, the tournament organizers are notified,
  and nothing finalizes on a timer from there.
- **Correct the entry** — the player who reported the result can fix it as long as the match
  is not finalized, including after a dispute. The correction clears the confirmations
  already given and re-opens the validation round.
- **Talk it out** — every match carries a discussion thread, visible to its players and to
  the tournament organizers, where disputes and corrections are recorded as they happen.
- **Dispute after the fact** — on tournaments that finalize automatically, a participant
  still has a 7-day window to raise a dispute on a finalized result.
- **Cancel** — a participant can cancel a match that shouldn't count. Once a match is
  finalized, cancelling is tighter: only the player who reported it, only within 48 hours,
  and only in championship or ranked mode.

A shared-terminal **kiosk** role exists for club venues: a tablet at the table can create and
report matches it set up, without being able to confirm or dispute on players' behalf.

## Validation modes

Every championship and ranked tournament picks its own **validation mode** — how much
confirmation a reported match result needs before it's locked in:

- **None** — results finalize the instant they're reported. Still disputable for 7 days
  afterward if something was wrong.
- **Auto** — finalizes automatically after an organizer-set delay (1 to 168 hours), unless
  disputed first. An opponent can also confirm early to finalize immediately.
- **Strict** (the default for new tournaments) — requires explicit confirmation from a player
  on the opposing side before the result locks in; with three sides or more, a majority of the
  sides must agree (the reporter's side counts). No timer, no automatic finalization.
- **Admin** — full manual control: only a tournament admin can validate and finalize a
  reported result.

Layered on top of Auto, a **Trust Score** system lets the app learn who to rely on: a player
with a strong track record of clean, undisputed reports gets their results auto-finalized
instantly, skipping the wait entirely. Disputing someone's report resets their trust score,
so trust has to be earned back.

Whatever the mode, a contested match never resolves itself: the timer only settles silence,
not disagreement. A dispute pauses the match, raises a task for the tournament organizers,
and opens the discussion thread. The player who entered the result can correct it at any
point before finalization — a correction clears the validations already collected and starts
the round again. The discussion can also end the dispute on its own: a player who contested
may accept the result afterwards, and once no dispute is left the match returns to a normal
validation round.

## Team formats

A match opposes two sides by default, each holding the same number of players — whatever
the discipline and whatever the team size. What changes is who fills those sides:
championships and brackets pick one of two team modes, and a side can be a single player.

- **Solo** — team size 1 on both sides, so a plain 1v1. Not a separate mode, just the
  smallest team size.
- **Flex** — teammates are grouped per match, so rosters can shuffle from one game to the
  next. Ideal for a group where whoever shows up plays together.
- **Static** — a fixed roster carries the same lineup across the whole event, and standings
  track the team rather than reshuffling every round.

Team size is yours to set with a minimum and maximum, so the same platform covers 1v1 chess,
2v2 foosball, and 5v5 five-a-side.

### Matches of three sides or more

Championships and ranked seasons can let a match oppose more than two sides — a 1v1v1 kart
race, a 2v2v2 pétanque game, up to eight sides. The organiser sets the **maximum number of
sides per match** (2 by default, which keeps every match a duel); each match then holds
anywhere between two sides and that maximum. Brackets always stay duels.

When entering such a match, add the sides you need on the composition step (or the team
step in static mode), then give the **finishing order** on the result step: drag the sides
into place, and use the **=** button to tie a side with the one above it. When the
competition keeps scores, the order follows the scores — highest first, equal scores tied —
and can still be adjusted by hand.

How a placement counts:

- **Win, draw or loss.** Alone in first place is a win; sharing first place is a draw (only
  where draws are allowed); any other place is a loss.
- **Championship points** come from the competition's points source: the win/draw/loss
  points, a **points-per-place table** (for example 10 / 6 / 3 / 1), or each side's **raw
  score**. Changing the source recalculates the standings.
- **Head-to-head** and the player statistics against a given opponent read each duel within
  the match: whoever finished ahead of the other won that duel.
- **Ranked MMR** treats the match as all the duels it contains — see
  [MMR Rating](/docs/mmr#matches-of-three-sides-or-more).
- **Validation** in strict mode needs a **majority of the sides** to agree with the reported
  result (the reporter's side counts): two sides out of three, three out of four. With two
  sides this is the usual rule — the other side confirms.

## Static team rosters

For events where teams stay together, Skol Arena manages a static roster: add and remove
members, keep a stable identity across every match, and let standings track the team rather
than reshuffling per round.
