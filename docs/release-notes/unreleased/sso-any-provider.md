---
type: new
title: Sign in through any single sign-on provider, several at once
audience: self-hosters
---
Single sign-on is no longer limited to Keycloak: Authentik, Zitadel, Dex or any other
OpenID Connect provider works, and you can offer several side by side, each with its own
button on the login screen. Signing out of Skol Arena now also signs out of the provider
when it supports it. An existing Keycloak setup keeps working as it is, nothing to change on
the Keycloak side. See the environment variables page to add a provider.
