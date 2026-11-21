---
title: Why Skol Arena exists
summary: Because a competitive community outlives any single tournament.
order: 0
---

Skol Arena is a platform for running persistent competitive communities, and it exists because almost nothing else is. Most competition tools are built around one shape: an organizer sets everything up, players show up, scores get entered, the event ends. Someone screenshots a spreadsheet, results live in a Discord thread, and the whole history resets for the next event.

That works for a single tournament day. It breaks down as soon as your competition lives across days or weeks, when players can't all meet at the same time, or when your discipline doesn't fit a rigid two-player bracket.

Skol Arena is built for the group that keeps competing — an office ladder, a campus league, a club's monthly night, an esports team's internal scrims — where "who's actually good" and "who won last time" matter well beyond a single event. Seasons recur, ratings persist, and the history survives.

The other half of the idea is who does the work. In most tools every result funnels through one person, and the competition stalls whenever that person is busy. Here, the players in a match create it, report it, confirm it, contest it, or cancel it themselves, from their phone. Admin controls are real and still there — tournament admins and co-admins can edit, finalize, and override anything — but the competition doesn't wait on them.

Letting players report freely costs you credibility unless you protect it, so that's where the guardrails sit: a validation mode chosen per tournament, a trust score that fast-tracks reliable reporters and resets the moment one of their reports is disputed, and championship limits capping how many matches count and how often the same players can face or partner with each other.

Under the hood it's a Vue 3 frontend on a Hono/Bun API with PostgreSQL, real-time updates, and native or OpenID Connect SSO login. Self-hostable today, open source under AGPL-3.0.
