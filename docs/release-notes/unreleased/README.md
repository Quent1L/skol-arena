# Unreleased functional release notes

Every change a player or an organiser can notice ships with a note in this folder, in the
same PR. At release time, `scripts/apply-release-notes.ts` (the `after:bump` hook of
release-it) gathers every note here into `docs/src/content/changelog/<version>.md`, deletes
the notes, and the result is published on [/changelog](https://skol-arena.com/changelog).
The app's "What's new" menu entry and the GitHub release both link to it.

`CHANGELOG.md` stays the technical changelog, generated from commits. This is the other one:
the one people actually read.

## Format

One file per change, any name ending in `.md` (a short slug: `photo-viewer.md`). Files
starting with `_` are ignored, which is handy for a note that is not ready yet.

```md
---
type: new
title: See a player's photo full screen
---
Tap a player's photo on their profile to open it full size. Tap anywhere to close it.
```

- `type` — which of the three sections the note goes in (see below).
- `title` — one line, what the person gets. Quote it if it contains a `:`.
- `audience` — optional, who the note concerns when it is not everyone: `players`,
  `tournament-admins`, `super-admins` or `self-hosters`, several separated by commas. It
  shows as "**For tournament admins** ·" in front of the text. Leave it out for everyone.
- Body — one or two short paragraphs. Several paragraphs, lists and images are fine. Leave
  it empty when the title says it all: the note then shows as a single bullet.

A release with no note here publishes no functional notes, and the app's badge stays off.

## New, improved or fixed?

| Type | Shown as | Means | Typical commit |
| --- | --- | --- | --- |
| `new` | ✨ New | Something you could not do or see before | `feat` adding a capability |
| `improved` | ⚡ Improved | Something that worked, now easier, clearer, faster or fairer — by design | `feat` reworking an existing one, `perf`, `style` |
| `fixed` | 🐛 Fixed | Something that did not work as intended, and now does | `fix` |

Ask "was it broken?". If yes, it is `fixed`, even when the fix also makes things nicer —
a security hole closed is `fixed` too. If it worked but now works better, it is
`improved`. Never file a bug fix under `improved` to make it sound better: readers rely on
the distinction.

## Writing for players and organisers

Write for someone who uses Skol Arena and has never seen its code.

- Say what the person can now **do** or **see**, not how it was built.
- Use the words of the interface: tournament, match, ranking, season, profile.
- No technical vocabulary: no API, endpoint, cache, migration, WebSocket, refactor, bundle.
- Say who it is for when it is not everyone: "Organisers can now…", "Admins can now…".
- Internal changes (tests, refactoring, performance nobody perceives, dependencies) get no
  note at all.

| Avoid | Prefer |
| --- | --- |
| Add `GET /users/compare` endpoint | Compare any two players side by side |
| Invalidate leaderboard cache on rename | A renamed player now shows their new name in rankings straight away |
| Fix race condition in WS reconnect | Live scores no longer freeze after your phone goes to sleep |

## Images

Put images in `docs/src/assets/changelog/` — that folder never moves — and reference them
with a relative path from this folder:

```md
![The full-screen photo viewer](../../src/assets/changelog/photo-viewer.png)
```

The path previews correctly in an editor or on GitHub. When the note is moved into the
changelog, the script rewrites the path so it still points at the same file, and refuses to
release if the image does not exist. Always write a meaningful alt text: it is what screen
readers and search engines get.
