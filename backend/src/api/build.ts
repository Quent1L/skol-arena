import type { Context, Next } from "hono";
import { requireAuth } from "../middleware/auth";
import { createAppHonoOptional, type AppHonoOptional, type AppVariablesOptional } from "../types/hono";
import { INTERNAL_PREFIX } from "./dispatch";
import { isPublicRoute } from "./public-routes";
import { VERSION_MOUNTS } from "./registry";
import type { ApiVersion } from "./versions";

/**
 * Builds the app serving a single API major.
 *
 * The result is mounted under INTERNAL_PREFIX at boot, and the same function feeds
 * OpenAPI generation — so the documented surface is the served surface by
 * construction, not by convention.
 */
export function buildVersionApp(version: ApiVersion): AppHonoOptional {
  const app = createAppHonoOptional();

  app.use("*", async (c, next) => {
    c.set("apiVersion", version);
    await next();
  });

  // Authentication is the default, not something each route opts in to: a route
  // added later is protected without anyone having to remember it.
  app.use("*", requireAuthUnlessPublic(`${INTERNAL_PREFIX}/${version}`));

  for (const { path, router } of VERSION_MOUNTS[version]) {
    // Hono infers a sub-app's Env from the argument, which a heterogeneous manifest
    // erases. The two router flavours differ only in whether appUserId is already
    // guaranteed — requireAuth is what establishes that at runtime, not the mount.
    app.route(path, router as AppHonoOptional);
  }

  return app;
}

/**
 * requireAuth for every route of the version app except the PUBLIC_ROUTES allowlist.
 * Named so a walk of the route table can tell it apart from the other middlewares.
 */
function requireAuthUnlessPublic(root: string) {
  return async function requireAuthUnlessPublic(
    c: Context<{ Variables: AppVariablesOptional }>,
    next: Next
  ) {
    const path = c.req.path.slice(root.length) || "/";
    if (isPublicRoute(c.req.method, path)) return next();
    return requireAuth(c, next);
  };
}
