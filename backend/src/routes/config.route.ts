import { describe } from "../api/describe";
import { oidcProviders, showEmailPasswordForm } from "../config/auth";
import { appConfigSchema } from "@skol-arena/shared/types/index";
import { createAppHono } from "../types/hono";
import { rankedMatchMaxAgeHours } from "../config/ranked";
import { demoCredentials } from "../utils/init-demo-data";
import { isInvitationCodeRequired } from "../config/invitation";

const configRoute = createAppHono();

configRoute.get(
  "/",
  describe({
    tags: ["Config"],
    summary: "Get runtime configuration",
    description:
      "Server settings the client needs before a user is known: which sign-in " +
      "methods are enabled, the public key used to register for push, and the " +
      "ranked reporting window the match form mirrors. On a demo instance, also " +
      "the demo super admin's sign-in, so the login screen can show it.",
    success: { description: "Current configuration", schema: appConfigSchema },
  }),
  async (c) => {
    // Resolved once in config/auth.ts, including the deprecated-name fallback.
    const isEmailPasswordEnabled = showEmailPasswordForm;
    const keycloak = oidcProviders.find((provider) => provider.id === "keycloak");
    const keycloakConfig = {
      enabled: !!keycloak,
      clientId: keycloak?.clientId ?? null,
      issuer: keycloak?.issuer ?? null,
      realm: keycloak?.issuer.split("/realms/")[1]?.split("/")[0] ?? null,
      loginLabel: keycloak?.label ?? null,
    };

    return c.json({
      vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null,
      auth: {
        emailPassword: {
          enabled: isEmailPasswordEnabled,
        },
        oidc: oidcProviders.map(({ id, label }) => ({ id, label })),
        keycloak: keycloakConfig,
        invitationRequired: isInvitationCodeRequired(),
      },
      ranked: {
        matchMaxAgeHours: rankedMatchMaxAgeHours(),
      },
      demo: await demoCredentials(),
    });
  },
);

export default configRoute;
