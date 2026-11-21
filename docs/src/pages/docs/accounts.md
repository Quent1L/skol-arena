---
layout: ../../layouts/DocsLayout.astro
title: Accounts & Access
description: How players sign in, how invitation codes gate the instance, and how organizations scope a tournament to a group.
---

An instance is invite-only by default. This page covers the three pieces that decide who
gets in and what they can see: authentication, invitation codes, and organizations.

## Authentication

Accounts are backed by Better Auth, giving every player a secure login and every organizer
confidence that tournament data is tied to a real, authenticated identity.

Two kinds of sign-in are supported, independently togglable per deployment:

- **Native email & password** — built in, no extra setup.
- **Single sign-on** — through any OpenID Connect provider: Keycloak, Authentik, Zitadel,
  Dex, Authelia… Declare as many as you like, each gets its own button.

Everything can be enabled at the same time: players pick a method on the same login screen.
An SSO account automatically links to an existing native account that shares the same
email, so nobody ends up with duplicate accounts.

> **Only declare providers that verify email addresses.** Linking by email trusts every
> configured provider: anyone able to register `alice@example.com` on one of them can sign
> in as the Skol Arena player who owns that address. Your own IdP is fine; a provider where
> anyone can sign up with an address of their choosing is not.

Signing out of Skol Arena also signs out of the provider when it supports OpenID Connect
RP-initiated logout (Keycloak, Authentik, Zitadel do; Dex does not, the logout then stays
local). The provider sends the browser back to `/login`, which must be registered as a
post-logout redirect URI. On **Authentik**, set the provider's _invalidation flow_ to
`default-invalidation-flow`: the default `default-provider-invalidation-flow` only signs out
of the application and leaves the Authentik session open, so the next click on the SSO
button signs the player straight back in.

The variables that switch these on are listed in
[Environment Variables](/docs/environment-variables).

## Invitation codes

There is no open sign-up. Every account starts from an invitation code issued by the instance
administrator — a four-word passphrase like `frost-otter-ridge-plume`, easy to read out loud
or drop in a message.

Each code carries its own rules:

- **A number of uses** — one by default, or a larger batch for a whole team.
- **An optional expiry** — a code can run out after a set number of days, or never expire.
- **An optional organization** — bind a code to a group and redeeming it also makes the new
  player a member, so onboarding a private league is a single link.

There are three ways a code gets used:

- **At sign-up** — enter it on the registration screen, or follow a prefilled invite link that
  fills it in for you.
- **After signing in** — if an account was created without a code, the app asks for one before
  letting it in, rather than leaving a half-open account.
- **To join another group later** — an established player can redeem an organization-bound
  code from their settings to join an extra organization, without touching their account.

The gate applies to **every** login method: SSO doesn't bypass it. Signing in through
your identity provider still leaves you on the code screen until a code is redeemed, so an
open SSO realm can't quietly become an open instance.

## Organizations

By default a tournament is public on the instance: anyone can browse it, follow the standings,
and read the match history — signed in or not. That's the right default for a community
ladder, and the wrong one for a company league or a private club.

Attaching an **organization** to a tournament makes it visible only to that organization's
members:

- **It disappears from the listing** for everyone else — non-members simply never see it.
- **The tournament itself is closed too**, not just hidden. Standings, matches, and entries
  are all refused to non-members, so a shared link leaks nothing.
- **Members keep everything else.** Belonging to an organization doesn't hide the public
  tournaments — you see the public ones _plus_ your group's.

A player can belong to several organizations at once, which is what makes one instance
workable for a company, its teams, and an open community side by side.

Organizations are created and their membership is managed by the instance administrator, who
also picks the organization when creating a tournament — leaving it empty keeps the
tournament public.
