/* eslint-disable @typescript-eslint/no-explicit-any */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth, keycloak } from "better-auth/plugins";
import { db } from "./database";
import * as schema from "../db/schema";
import { emailService } from "../services/email.service";
import { invitationService } from "../services/invitation.service";
import { userRepository } from "../repository/user.repository";
import i18next from "./i18n";
import { logger } from "../utils/logger";
import { clearBootstrapPending } from "../utils/init-admin";
import { reportEmailDeliveryFailure } from "../utils/email-delivery-context";
import { isRateLimitEnabled } from "./rate-limit";
import { CLIENT_IP_HEADER } from "../utils/client-ip";

function extractInvitationCode(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(";").map((c) => c.trim());
  const invitationCookie = cookies.find((c) => c.startsWith("invitation_code="));
  return invitationCookie ? invitationCookie.split("=")[1] : null;
}

/**
 * Whether the frontend offers the email+password form.
 *
 * It says nothing about the server: /api/auth/sign-in/email stays live either way
 * (see the emailAndPassword block below), which is why the flag is named after the
 * form and not after the capability. The old name claimed to disable something it
 * never disabled, so it is still read — with a warning — for instances that set it.
 */
function resolveShowEmailPasswordForm(): boolean {
  const current = process.env.SHOW_EMAIL_PASSWORD_FORM;
  if (current !== undefined) return current !== "false";

  const legacy = process.env.ENABLE_EMAIL_PASSWORD;
  if (legacy !== undefined) {
    logger.warn(
      "ENABLE_EMAIL_PASSWORD is deprecated: rename it to SHOW_EMAIL_PASSWORD_FORM. " +
        "It only ever hid the sign-in form — the email+password endpoint stays enabled " +
        "either way, so that administrators keep a way in if Keycloak is unreachable.",
    );
    return legacy !== "false";
  }

  return true;
}

/**
 * Exported so GET /config reports the same answer this file resolved, rather than
 * re-reading the environment and drifting from it — which is how the flag ended up
 * being read two different ways.
 */
export const showEmailPasswordForm = resolveShowEmailPasswordForm();

const isEmailPasswordEnabled = showEmailPasswordForm;
const isKeycloakEnabled = !!(
  process.env.KEYCLOAK_CLIENT_ID &&
  process.env.KEYCLOAK_CLIENT_SECRET &&
  process.env.KEYCLOAK_ISSUER
);

if (!isEmailPasswordEnabled && !isKeycloakEnabled) {
  logger.fatal({
    emailPassword: isEmailPasswordEnabled,
    keycloak: isKeycloakEnabled,
  }, "CRITICAL CONFIGURATION ERROR: no authentication method is enabled");

  throw new Error(
    "AUTHENTICATION_CONFIG_ERROR: At least one authentication method must be enabled. " +
    "Set SHOW_EMAIL_PASSWORD_FORM=true or configure Keycloak (KEYCLOAK_CLIENT_ID, KEYCLOAK_CLIENT_SECRET, KEYCLOAK_ISSUER)"
  );
}

logger.info({
  emailPassword: isEmailPasswordEnabled,
  keycloak: isKeycloakEnabled,
}, "Authentication configuration");

const plugins: any[] = [];

// Shared function to process invitation codes during sign-up
async function processInvitationCode(
  user: any,
  request: any,
  source: string
): Promise<void> {
  if (!user) {
    logger.error(`[${source}] No user in context`);
    return;
  }

  logger.info(`[${source}] Processing user: ${user.id}`);

  const cookieHeader = request?.headers?.get("cookie");
  const invitationCode = extractInvitationCode(cookieHeader);

  if (!invitationCode) {
    logger.warn(
      `[${source}] No invitation code for user ${user.id} - appUser creation will be blocked`
    );
    return;
  }

  try {
    // Read from the header this process writes, not from x-forwarded-for: an address
    // the caller chose is worse than no address at all in an audit trail.
    const ipAddress = request?.headers?.get(CLIENT_IP_HEADER) || "unknown";

    await invitationService.consumeCode(
      invitationCode,
      user.id,
      user.email,
      ipAddress
    );

    logger.info(`[${source}] Code consumed successfully for user ${user.id}`);
  } catch (error: any) {
    logger.error(`[${source}] Code consumption failed:`, error);
    // Note: We do NOT delete the user here
    // appUser creation will be blocked in userService.getOrCreateAppUser()
  }
}

// Plugin to stop the startup password rotation once the bootstrap admin connects
plugins.push({
  id: "bootstrap-admin-activator",
  hooks: {
    after: [
      {
        matcher: (context: any) =>
          context.path === "/sign-in/email" ||
          context.path === "/change-password" ||
          context.path?.includes("/oauth2/callback/keycloak") ||
          context.path?.includes("/sign-in-oauth2"),
        handler: async (context: any) => {
          try {
            const signedIn =
              context.context?.newSession?.user ??
              context.context?.session?.user ??
              context.context?.returned?.user;
            if (signedIn?.id) {
              await clearBootstrapPending(signedIn.id);
            }
          } catch (error: any) {
            // Never let this break the login flow
            logger.error({ err: error }, "[Bootstrap Admin Hook] Failed to clear pending flag");
          }
          return {};
        },
      },
    ],
  },
});

// Plugin to consume invitation codes during sign-up
plugins.push({
  id: "invitation-code-consumer",
  hooks: {
    after: [
      {
        // Hook for email/password sign-up
        matcher: (context: any) => context.path === "/sign-up/email",
        handler: async (context: any) => {
          const user =
            context.context?.newSession?.user ?? context.context?.returned?.user;
          await processInvitationCode(user, context.request, "Email Registration Hook");
          return {};
        },
      },
      {
        // Hook for OAuth sign-up (Keycloak)
        matcher: (context: any) => {
          return (
            context.path?.includes("/oauth2/callback/keycloak") ||
            context.path?.includes("/sign-in-oauth2")
          );
        },
        handler: async (context: any) => {
          // Check whether this is a new user
          const user =
            context.context?.newSession?.user ?? context.context?.returned?.user;
          if (!user || !context.isNewUser) {
            return {};
          }

          await processInvitationCode(user, context.request, "Keycloak Hook");
          return {};
        },
      },
    ],
  },
});

if (isKeycloakEnabled) {
  plugins.push(
    genericOAuth({
      config: [
        keycloak({
          clientId: process.env.KEYCLOAK_CLIENT_ID!,
          clientSecret: process.env.KEYCLOAK_CLIENT_SECRET!,
          issuer: process.env.KEYCLOAK_ISSUER!,
          pkce: process.env.KEYCLOAK_PKCE === "true",
          // Note: disableImplicitSignUp is NOT set (defaults to false)
          // This allows account creation which will then be validated by the invitation-code-validator hook
          // The hook will delete the user if no valid invitation code is present
        }),
      ],
    })
  );
}

// Without BETTER_AUTH_URL the localhost fallback emits cookies with no `Secure` flag and
// narrows trustedOrigins to localhost: random logouts that are very hard to diagnose.
if (process.env.NODE_ENV === "production" && !process.env.BETTER_AUTH_URL) {
  console.warn(
    "[auth] BETTER_AUTH_URL is not set in production: falling back to http://localhost:3000. " +
      "Session cookies will be emitted without the Secure attribute and trustedOrigins will only contain localhost.",
  );
}

// Dynamic Better Auth configuration
const authConfig: any = {
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  // Records the last login on app_users so it survives session expiry.
  // Runs on session creation only (i.e. at login), not on every request.
  databaseHooks: {
    session: {
      create: {
        after: async (createdSession: { userId: string }) => {
          try {
            await userRepository.touchLastLogin(createdSession.userId);
          } catch (error) {
            logger.warn({ err: error, userId: createdSession.userId }, "Failed to record last login");
          }
        },
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh if the session is more than 1 day old
    // Avoids a Postgres lookup on every request (addUserContext runs on "*").
    // Accepted trade-off: revoking a session takes up to 5 min to apply.
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["keycloak"],
    },
  },
  // The dev origins are dropped in production: leaving them trusted there means a
  // page served from the victim's own localhost passes the origin check against the
  // real deployment.
  trustedOrigins: [
    ...(process.env.NODE_ENV === "production"
      ? []
      : ["http://localhost:5173", "http://localhost:3000"]),
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
    ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
  ],
  baseURL: process.env.BETTER_AUTH_URL || process.env.BASE_URL || "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  // Declared rather than left to the default: reading this file was previously no
  // way of telling what, if anything, protected the login. Stored in the database so
  // the counters survive a restart and hold across instances — an in-memory window
  // resets every deploy. See config/rate-limit.ts for when it is armed.
  // Better Auth resolves the caller from a header rather than from x-forwarded-for
  // directly: index.ts writes CLIENT_IP_HEADER on every request that reaches the auth
  // handler, having placed the caller itself (see utils/client-ip). Left to its own
  // resolution it refuses a multi-valued x-forwarded-for and counts every sign-in in
  // one shared window, which anyone able to send that header could then exhaust for
  // the whole instance.
  advanced: {
    ipAddress: {
      ipAddressHeaders: [CLIENT_IP_HEADER],
    },
  },
  rateLimit: {
    enabled: isRateLimitEnabled(),
    storage: "database",
    window: 60,
    max: 100,
    // The endpoints worth guessing at. Everything else keeps the window above.
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 5 },
      "/forget-password": { window: 300, max: 3 },
      "/reset-password": { window: 300, max: 5 },
    },
  },
  plugins,
};

// Email/password is always enabled in Better Auth to allow admin login.
// SHOW_EMAIL_PASSWORD_FORM=false only hides the form on the frontend side: the
// endpoint below stays reachable on purpose, so an administrator is not locked out
// when Keycloak is down. Anyone who needs it genuinely closed has to put the auth
// subtree behind their reverse proxy — the flag will not do it.
authConfig.emailAndPassword = {
  enabled: true,
  sendResetPassword: async ({ user, url }: any) => {
    try {
      await emailService.sendEmail({
        to: user.email,
        subject: i18next.t("emails.password_reset_subject"),
        text: i18next.t("emails.password_reset_text", {
          url,
          expiresIn: 60,
        }),
        html: i18next.t("emails.password_reset_html", {
          url,
          expiresIn: 60,
        }),
      });
    } catch (error) {
      // Better Auth swallows anything this hook throws, so the failure is handed to the
      // admin caller waiting for it. On the public flow nobody is listening: stay silent,
      // reporting the delivery status would reveal whether the account exists.
      if (!reportEmailDeliveryFailure(error)) {
        logger.error(
          { err: error },
          "Password reset email delivery failed (public flow)"
        );
      }
    }
  },
  resetPasswordTokenExpiresIn: 3600,
  minPasswordLength: 8,
  maxPasswordLength: 128,
};

export const auth = betterAuth(authConfig);
