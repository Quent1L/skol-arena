---
layout: ../../layouts/DocsLayout.astro
title: MMR Rating
description: How ranked MMR is computed — Elo on team averages, per-discipline sharing, seeding and recalculation.
---

Ranked competitions keep a persistent rating per player: the MMR. This page describes
exactly how it moves.

The guiding principle: **a match transfers MMR from one side to the other, it never
creates any.** The computation happens in three strictly separate steps — first _how
expected the result was_ (Elo on the team averages, producing a single player delta), then
_how much is at stake_ (that delta scaled by the size of the sides), then _who takes which
share of it_ (the discipline's team interaction mode, producing normalised shares).

## Scope

MMR only exists in **ranked** mode. A classic tournament — championship or bracket — never
writes MMR, whatever its disciplines and outcome types are.

## Season settings

Each ranked season carries its own tuning, set when the season is created and applied to
every match played in it.

| Setting                | Effect                                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Base MMR**           | Starting rating for a player with no history and no carry-over. Between 100 and 5000.                                                   |
| **K-factor**           | Base amplitude of a player's delta. Between 8 and 128.                                                                                  |
| **Placement matches**  | How many matches a player's delta is **doubled** over. Up to 20; 0 disables the placement phase.                                        |
| **Use previous MMR**   | Enables carry-over from an earlier season.                                                                                              |
| **Soft reset factor**  | Fraction of the distance to the source median that is kept, from 0 (hard reset) to 1.                                                   |
| **Source season**      | Which season the carry-over reads. Defaults to the last finished season of the discipline.                                              |
| **Tier scaling**       | Copies the source season's tier thresholds, or recomputes them from the population. Affects the **displayed rank only**, never the MMR. |
| **Asymmetric matches** | Allows uneven line-ups such as 1v2. The stake is not scaled there — see [Things to know](#things-to-know).                              |

## Competition ruleset

The scoring rules a match is valued with come from its discipline, but they are **frozen
onto the competition** when it opens. Both the calculation and the display read that
snapshot, never the live discipline.

While a competition is still a draft the snapshot follows the discipline — no match can
exist yet. After that, only an explicit propagation moves it, and that propagation triggers
the recalculation in the same pass, so a competition is never half under the old rules.
Editing a discipline therefore has no effect on a running or finished competition: its
numbers stay the ones it was played with.

| Rule                      | Effect                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Team interaction mode** | Individual, Shared Resource or Collaborative. Splits the side's stake between teammates. Defaults to Collaborative. |
| **Counts for MMR**        | When off, **every delta is 0** and the calculation short-circuits. When on, the score gap amplifies the K-factor.   |
| **MMR multiplier**        | Multiplies the delta. 0 means a match with no rating impact, 2 doubles it.                                          |
| **Points**                | Championship points only. **No effect on MMR.**                                                                     |

An archived outcome type disappears from match entry but stays resolvable for matches
already recorded with it.

## The calculation

```
1. Short-circuit   counts-for-MMR off → every delta is 0
2. Averages        avgA, avgB = arithmetic mean of each side's MMR
3. Expected score  E_A = 1 / (1 + 10^((avgB − avgA) / 400))
4. Effective K     kEff = K × scoreMult × mmrMultiplier
                   scoreMult = 1 + |scoreA − scoreB| / (scoreA + scoreB)   ∈ [1, 2]
5. Player delta    playerDeltaA = round(kEff × (W_A − E_A))
6. Stake           teamDeltaA = playerDeltaA × |A|   when |A| = |B|
                              = playerDeltaA         when the sides are uneven
                   teamDeltaB = −teamDeltaA        ← set, not recomputed
7. Shares          share_i per side, Σ share = 1
8. Allocation      integers by largest remainder, exact sum
9. Placement       delta_i ×2 for a player still in placement
10. Floor          newMmr = max(1, mmr + delta)
11. Settlement     the losing side is priced first; whatever the floor kept a
                   player from paying is withheld from the winners' pot
```

`W` is 1 for a win, 0 for a loss, 0.5 for a draw. Score amplification runs from ×1 (equal
score, 0-0, or no score at all) to ×2 (a shutout) and depends on the gap, not on the winner
— both sides take it identically.

`teamDeltaB` is **set** to `−teamDeltaA` rather than recomputed from `E_B`: that is what
makes the two sides cancel exactly, since rounding is not symmetric on halves
(`round(2.5) = 3` but `round(−2.5) = −2`).

## The stake, and why it scales with the format

Step 5 answers a 1v1 question: how much would _one_ player move on this result. Step 6
turns it into what the side plays for. On even sides the stake is that delta times the
number of players, so each side splits a pot of the same size and **every player moves by
exactly what they would have moved in a 1v1** — a win in 3v3 at K-factor 32 is worth what
a win in 1v1 at K-factor 32 is worth. Rounding happens before the scaling, not after, so
the pot is a multiple of the side size and an equal split lands on the 1v1 figure rather
than a point off it.

Uneven sides get **no scaling at all**: the stake stays one player delta, split within each
side. Scaling on the larger side would make the shorter one swing by the size ratio times
`kEff` — in a 1v11 that is eleven times a normal loss, enough to wipe a player out in a
single match. One delta per side keeps every line-up inside the risk a 1v1 already carries:
the lone player takes the whole stake, their opponents share it.

The stake is also **settled**, not just allocated. The losing side is priced first, and a
player stopped by the floor at 1 pays what they have rather than what they owe; the
difference is withheld from the winners' pot instead of appearing from nowhere. In practice
it only ever comes up at the very bottom of a ladder — a player below the match's effective
K — but it is what makes the invariant exact rather than nearly exact.

## Matches of three sides or more

A season can allow matches with more than two sides — 1v1v1, 2v2v2, four players around a
kart race. Such a match records a **placement** for every side (1 for first, tied sides
sharing a place) rather than a single winner, and the MMR reads it as **every duel it
contains**: each pair of sides is priced exactly like a two-side match of its own, the side
that finished ahead winning it and a shared place counting as a draw.

A player's delta is the **average of their N − 1 duels**, all priced on the MMR everyone
brought into the match. Averaging rather than summing is what keeps a 1v1v1 inside the
risk of a duel: the winner of a three-player match between equals gains what a duel win is
worth (+16 at K-factor 32), the last loses what a duel loss costs (−16), and the middle one,
who won one duel and lost the other, does not move.

Two details follow from that:

- The placement multiplier and the MMR floor apply once, to the averaged delta.
- The average is rounded per player, so a match of three sides or more can leave a point or
  two unbalanced. Like placement, it is a bounded exception to the invariant below.

A match with exactly two sides goes through the two-side calculation untouched: allowing
more sides changes nothing for the duels of the season.

The player's own record follows the placement: **alone in first place is a win, a shared
first place a draw, any other place a loss** — a second place out of four counts as a loss
in the win/loss streaks and the match history, even though it can earn MMR.

## Sharing between teammates

The team interaction mode is the only calculation lever carried by the discipline. It
applies at step 7 only: it never changes the strength of the result, only its distribution.

```
r_i     = clamp(oppAvgMmr / max(1, mmr_i), 0.75, 1.25)
sign    = teamDelta >= 0 ? +1 : −1
exp     = mode is Individual ? α × sign : α
w_i     = r_i ^ exp
share_i = w_i / Σ w
```

One formula, three values of α:

| Mode            | α   | On a win | On a loss |
| --------------- | --- | -------- | --------- |
| Collaborative   | 0   | 0        | 0         |
| Shared Resource | 0.5 | +0.5     | +0.5      |
| Individual      | 1   | +1       | **−1**    |

Collaborative with α = 0 gives a weight of 1 for everyone, so `share = 1/n`: the equal
split is not a special case, it is the degenerate case of the general formula.

| Mode            | Behaviour                                                                                                                                                      | Fits                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Collaborative   | Strictly equal shares, whatever the individual MMR.                                                                                                            | Team sports, MOBAs, shooters — the loss is collective.                                      |
| Shared Resource | The lower-rated player takes the bigger share, **on a win as on a loss**. Volatility indexed on rating.                                                        | Doubles pétanque, formats where each player owns a comparable share of the common resource. |
| Individual      | The exponent flips on a loss: the weaker player gains more **and** loses less, the stronger gains less **and** loses more. A pull toward the opponents' level. | Darts, pool, bowling — each plays their own game, the favourite owns their defeat.          |

**In 1v1 the mode has no effect.** One player per side means a share of 1, so the player
takes the whole stake, whatever the mode. The invariance is structural, not a special case
in the engine.

**Worked example: 2v2, {900, 1400} against {1150, 1150}.** Both averages are 1150, so
`E = 0.5`, `kEff = 32` and the player delta is ±16 — the sides are even, so each plays for
a stake of ±32 split between its two players.

| Case                  | p900    | p1400   | Opponents |
| --------------------- | ------- | ------- | --------- |
| Win, Collaborative    | +16     | +16     | −16 / −16 |
| Win, Shared Resource  | +18     | +14     | −16 / −16 |
| Win, Individual       | +19     | +13     | −16 / −16 |
| Loss, Collaborative   | −16     | −16     | +16 / +16 |
| Loss, Shared Resource | −18     | −14     | +16 / +16 |
| Loss, Individual      | **−13** | **−19** | +16 / +16 |

The last row is what separates Individual from Shared Resource: same team, same match,
responsibilities inverted.

**Scale consequence.** None on even sides: the Collaborative rows are exactly the ±16 a 1v1
at K-factor 32 pays, so the K-factor means the same thing in every format and needs no
compensation. The mode only redistributes around that figure.

## One engine, three paths

Three situations compute MMR, and all three call the same engine with the same ruleset.
They differ **only in the MMR snapshot** they are given:

| Path                    | When                                       | Snapshot                                |
| ----------------------- | ------------------------------------------ | --------------------------------------- |
| Official                | Match finalised, cancelled or recalculated | Match history, then current MMR         |
| Per-match preview       | Match reported, before validation          | Current MMR                             |
| Provisional leaderboard | Non-finalised matches, cached              | Current MMR, advanced match after match |

Team averages, MMR multiplier, team interaction mode, the doubled placement delta and the
counts-for-MMR short-circuit behave identically on all three. In other words: **the delta
shown before validation is, by construction, the one applied at finalisation.**

Rounding is deterministic — allocation by largest remainder, equal remainders broken by
ascending player id. Player iteration order therefore influences no result, which is a
necessary condition for deterministic season replay.

## Season start: carry-over and soft reset

Carry-over fills a set of seeds, never the live ladder: a seeded player who never plays
appears neither in the standings nor in the percentiles.

```
eligible = players of the source season with matchesPlayed ≥ max(1, source placementMatches)
anchor   = median of the eligible players' current MMR
seed     = max(1, round(baseMmr + (mmr − anchor) × softResetFactor))
```

With carry-over off there are no seeds and everyone starts at base MMR. A soft reset factor
of 0 is a hard reset; 1 keeps the full distance to the median, recentred on the new base.
Median rather than mean, because a handful of runaway players must not drag the whole
ladder's reset point.

The entry MMR is resolved the same way everywhere:

```
match history  →  current MMR  →  carry-over seed  →  base MMR
```

## Recalculation

| Trigger              | Scope                                                               |
| -------------------- | ------------------------------------------------------------------- |
| Match finalised      | Direct participants from its date onward, then propagation in waves |
| Match cancelled      | Same, tagged as a cancellation                                      |
| Forced recalculation | The whole season, global chronological replay                       |

The cascade exists because a backdated match rewrites the history of players who were not
in it: it recomputes, in successive waves, everyone who crossed a player whose MMR moved,
until it stabilises.

The deterministic replay processes each match exactly once in order (by date, then id),
keeping per-player state in memory and making a **single engine call per match**, so every
participant is valued on the same pre-match snapshot.

## Worked examples

Baseline: K-factor 32, two players at 1000, MMR multiplier 1, placement over.

| Scenario                       | Effective K      | Deltas        |
| ------------------------------ | ---------------- | ------------- |
| 1v1, no score                  | 32               | +16 / −16     |
| 1v1, score 10-0                | 64               | +32 / −32     |
| 1v1, score 6-4                 | 38.4             | +19 / −19     |
| 1v1, winner in placement, 10-0 | 128 for them, 64 | **+64** / −32 |
| 1v1, MMR multiplier 2          | 64               | +32 / −32     |
| 1v1, counts-for-MMR off        | 0                | 0 / 0         |
| 1v1, 900 beats 1400            | 32               | +30 / −30     |
| 1v1, draw 1000 against 1400    | 32               | +13 / −13     |

A draw is a real Elo result: the underdog gains MMR, the favourite loses some.

## The invariant

```
Σ delta(side A) + Σ delta(side B) = 0
```

Exact, with two deliberate exceptions:

1. **Placement.** A player in placement has their delta doubled after the split, so a
   rookie converges twice as fast without their opponents risking double. The injection is
   bounded by `placementMatches × K` per player and disappears once placement is over.
2. **Matches of three sides or more.** Each player's averaged delta is rounded on its own,
   which can leave a point or two per match unbalanced (see above). Two-side matches are
   not concerned.

**The MMR floor of 1 is not an exception.** A player cannot pay more than they own, and
what they cannot pay is withheld from the winners rather than created — see the settlement
step above. It only comes into play when a player's MMR is below what the match asks of
them, which needs a low base MMR and a high K-factor at once.

How much a single match can ask of one player: on even sides it is exactly the 1v1 delta in
Collaborative, and more than that in the weighted modes, where the level weighting hands one
player a larger share of the stake. The ±25% clamp bounds how far — the ratio to the 1v1
delta tops out at `(1.25 / 0.75)^α`, so **1.29× in Shared Resource and 1.67× in Individual**,
and those limits are only approached on large teams: Individual gives 1.25× in a 2v2 and
1.43× in a 4v4 (the 2v2 table above shows 19 against a player delta of 16). On uneven sides
nobody exceeds the 1v1 delta. Placement doubles whatever that figure comes to.

## Things to know

1. **Asymmetric matches carry no compensation.** The stake is scaled by the side size only
   when both sides field the same number of players. In 1v2 it stays one player delta: the
   lone player takes 100% of it, against 50% each on the other side, so their MMR moves
   twice as fast per match — five times as fast in a 1v5. It is coherent — they did all the
   work — but it is a choice, not a mechanical consequence. Scaling there instead would let
   the shorter side swing past what its players own, and the floor would turn the shortfall
   into created MMR.
2. **Outcome type points play no role in MMR.** They only feed championship points, so
   changing them has no effect on a ranked ladder.
3. **An MMR multiplier of 0 and counts-for-MMR off** both produce a zero delta, but only
   the second short-circuits the whole calculation.
4. **The default mode is silent.** A discipline created without a team interaction mode
   runs as Collaborative. The snapshot freezes it as such, so the default that was applied
   stays in force even if the discipline is corrected later.
5. **Editing a discipline no longer affects any open competition.** Each competition
   carries its own ruleset snapshot. Propagating a change is an explicit action that
   recalculates the competitions you pick, and finished competitions are never offered.
6. **The stored effective K** is the match K, doubled for a player in placement — not a
   display value recomputed separately.
7. **A formula change re-runs unfinished seasons automatically.** Each season records the
   engine version it was computed with. On startup, every unfinished ranked season left on
   an older version is queued for a deterministic replay, so an upgrade ships its own data
   migration. Finished seasons stay frozen — their carry-over seeds are already derived —
   and keep the stamp of the version that computed them. A recalculation can also be forced
   from the competition's admin actions.
