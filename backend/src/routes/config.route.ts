import { describe } from "../api/describe";
import { showEmailPasswordForm } from "../config/auth";
import { appConfigSchema } from "@skol-arena/shared/types/index";
import { createAppHono } from "../types/hono";
import { rankedMatchMaxAgeHours } from "../config/ranked";

const configRoute = createAppHono();

configRoute.get(
  "/",
  describe({
    tags: ["Config"],
    summary: "Get runtime configuration",
    description:
      "Server settings the client needs before a user is known: which sign-in " +
      "methods are enabled, the public key used to register for push, and the " +
      "ranked reporting window the match form mirrors.",
    success: { description: "Current configuration", schema: appConfigSchema },
  }),
  (c) => {
    // Resolved once in config/auth.ts, including the deprecated-name fallback.
    const isEmailPasswordEnabled = showEmailPasswordForm;
    const isKeycloakEnabled = !!(
      process.env.KEYCLOAK_CLIENT_ID &&
      process.env.KEYCLOAK_CLIENT_SECRET &&
      process.env.KEYCLOAK_ISSUER
    );

    const keycloakConfig = {
      enabled: isKeycloakEnabled,
      clientId: process.env.KEYCLOAK_CLIENT_ID || null,
      issuer: process.env.KEYCLOAK_ISSUER || null,
      realm: process.env.KEYCLOAK_ISSUER
        ? process.env.KEYCLOAK_ISSUER.split("/realms/")[1]?.split("/")[0]
        : null,
      loginLabel: process.env.KEYCLOAK_LOGIN_LABEL || null,
    };

    return c.json({
      vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null,
      auth: {
        emailPassword: {
          enabled: isEmailPasswordEnabled,
        },
        keycloak: keycloakConfig,
      },
      ranked: {
        matchMaxAgeHours: rankedMatchMaxAgeHours(),
      },
    });
  }
);

export default configRoute;
