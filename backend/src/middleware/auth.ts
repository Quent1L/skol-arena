import type { Context, Next } from "hono";
import { auth } from "../config/auth";
import { userService } from "../services/user.service";
import { userRepository } from "../repository/user.repository";
import type { AppVariablesOptional } from "../types/hono";
import { logger } from "../utils/logger";

type AppContext = Context<{
  Variables: AppVariablesOptional;
}>;

/**
 * The little a viewer lookup needs from a context. Structural on purpose: routers
 * come in both variable flavours (appUserId guaranteed or not), and Hono's Context
 * is invariant in them, so naming either one here would lock the helper to half the
 * routes that need it.
 */
type ViewerContext = {
  get(key: "user"): AppVariablesOptional["user"] | undefined;
};

export async function requireAuth(c: AppContext, next: () => Promise<void>) {
  const betterAuthUser = c.get("user");

  if (!betterAuthUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const appUserId = await userService.getOrCreateAppUser(
      betterAuthUser.id,
      betterAuthUser.name || betterAuthUser.email
    );

    c.set("appUserId", appUserId);
    await next();
  } catch (error: unknown) {
    // Deactivated account: the session may still be valid (auth cookie cache)
    if ((error as { code?: string }).code === "USER_DEACTIVATED") {
      logger.warn(`[Auth Middleware] User ${betterAuthUser.id} is deactivated`);

      return c.json(
        {
          error: {
            code: "USER_DEACTIVATED",
            message: "Votre compte a été désactivé.",
          },
        },
        403
      );
    }

    // If the error is related to a missing invitation code
    if ((error as { code?: string }).code === "INVITATION_CODE_REQUIRED") {
      logger.warn(`[Auth Middleware] User ${betterAuthUser.id} is authenticated but has no invitation code`);

      // Return a 403 Forbidden error with a clear message
      // The user is authenticated (valid session) but must submit an invitation code
      return c.json(
        {
          error: {
            code: "INVITATION_CODE_REQUIRED",
            message: "Vous devez soumettre un code d'invitation pour activer votre compte."
          }
        },
        403 // Forbidden (authenticated but not authorized)
      );
    }

    // Other errors
    throw error;
  }
}

/**
 * Resolves the caller's app user id on a route that stays open to anonymous
 * visitors, so a read can be scoped without being closed.
 *
 * Deliberately not requireAuth, and deliberately `getByExternalId` rather than
 * `getOrCreateAppUser`: the latter throws for a deactivated account or one that
 * never redeemed an invitation, which would turn a public read into an error
 * instead of simply narrowing what that caller may see. Anyone without a resolvable
 * app profile is treated as anonymous.
 */
export async function resolveOptionalViewer(c: ViewerContext): Promise<string | null> {
  const betterAuthUser = c.get("user");
  if (!betterAuthUser) return null;

  const appUser = await userRepository.getByExternalId(betterAuthUser.id);
  return appUser?.id ?? null;
}

/**
 * Better Auth slides the 30-day session inside getSession: past `updateAge` it
 * extends the row AND re-emits the session cookie with a fresh maxAge. Since this
 * middleware runs on every request, it consumes that refresh before the client's
 * own /api/auth/get-session can; dropping its Set-Cookie headers would leave the
 * browser cookie stuck on the maxAge issued at login, so the user gets logged out
 * ~30 days after signing in no matter how active they are.
 *
 * Requests to /api/auth/* are skipped: the Better Auth handler answers them right
 * after and emits its own, authoritative cookies.
 */
function forwardAuthCookies(c: Context, authHeaders: Headers): void {
  if (c.req.path.startsWith("/api/auth/")) return;

  for (const cookie of authHeaders.getSetCookie()) {
    c.res.headers.append("set-cookie", cookie);
  }
}

export async function addUserContext(c: Context, next: Next) {
  const { headers: authHeaders, response: session } = await auth.api.getSession({
    headers: c.req.raw.headers,
    returnHeaders: true,
  });

  if (!session) {
    c.set("user", null);
    c.set("session", null);
    await next();
    forwardAuthCookies(c, authHeaders);
    return;
  }

  c.set("user", session.user);
  c.set("session", session.session);

  // Fire-and-forget: recording activity must never block or fail a request.
  void userService
    .recordActivity(session.user.id)
    .catch((error) =>
      logger.warn({ err: error, userId: session.user.id }, "Failed to record activity")
    );

  await next();
  forwardAuthCookies(c, authHeaders);
}
