import tournaments from "../routes/tournaments.route";
import teams from "../routes/teams.route";
import users from "../routes/user.route";
import avatars from "../routes/avatar.route";
import session from "../routes/session.route";
import matches from "../routes/matches.route";
import disciplines from "../routes/disciplines.route";
import outcomeTypes from "../routes/outcome-types.route";
import outcomeReasons from "../routes/outcome-reasons.route";
import notifications from "../routes/notification.route";
import config from "../routes/config.route";
import invitations from "../routes/invitations.route";
import gameRules from "../routes/game-rules.route";
import ranked from "../routes/ranked.route";
import adminInvitations from "../routes/admin/invitations.route";
import adminMaintenance from "../routes/admin/maintenance.route";
import adminOrganizations from "../routes/admin/organizations.route";
import adminRules from "../routes/admin/rules.route";
import adminUsers from "../routes/admin/users.route";
import type { AppHono, AppHonoOptional } from "../types/hono";
import { API_VERSIONS, type ApiVersion } from "./versions";

export type RouteMount = {
  /** Path under the version root, i.e. what follows /api in the public URL. */
  path: string;
  router: AppHono | AppHonoOptional;
};

/**
 * Routers are shared by reference across versions, never copied: app.route()
 * re-registers a sub-app's routes into the parent, so the same instance can back
 * several versions at once. A new version therefore only restates the mounts whose
 * behaviour actually changed — see withOverrides below.
 */
const BASE_MOUNTS: RouteMount[] = [
  { path: "/tournaments", router: tournaments },
  // Shares the /tournaments prefix with the router above: its own paths all start
  // with /:id/teams.
  { path: "/tournaments", router: teams },
  { path: "/users", router: users },
  // Shares the /users prefix: its paths are /me/avatar, /:id/avatar, /avatars/lookup.
  { path: "/users", router: avatars },
  { path: "/user", router: session },
  { path: "/matches", router: matches },
  { path: "/disciplines", router: disciplines },
  { path: "/outcome-types", router: outcomeTypes },
  { path: "/outcome-reasons", router: outcomeReasons },
  // Mounted at the version root: its paths are /me/notifications, /me/pushDevices…
  { path: "/", router: notifications },
  { path: "/config", router: config },
  { path: "/invitations", router: invitations },
  { path: "/game-rules", router: gameRules },
  { path: "/ranked", router: ranked },
  { path: "/admin/invitations", router: adminInvitations },
  { path: "/admin/maintenance", router: adminMaintenance },
  { path: "/admin/organizations", router: adminOrganizations },
  { path: "/admin/rules", router: adminRules },
  { path: "/admin/users", router: adminUsers },
];

/**
 * Replaces the router mounted at a given path, leaving every other mount shared
 * with the base. This is how a future version stays a delta:
 *
 *   v2: withOverrides(BASE_MOUNTS, { "/tournaments": tournamentsV2 })
 *
 * Throws on a path that is not mounted, so a typo fails at boot instead of silently
 * serving the old router.
 */
export function withOverrides(
  base: RouteMount[],
  overrides: Record<string, RouteMount["router"]>
): RouteMount[] {
  const known = new Set(base.map((mount) => mount.path));
  for (const path of Object.keys(overrides)) {
    if (!known.has(path)) {
      throw new Error(`Cannot override "${path}": no router is mounted there`);
    }
  }

  return base.map((mount) =>
    overrides[mount.path] ? { ...mount, router: overrides[mount.path]! } : mount
  );
}

export const VERSION_MOUNTS: Record<ApiVersion, RouteMount[]> = {
  v1: BASE_MOUNTS,
};

/** Guards against a version being declared but never given a route manifest. */
export function assertEveryVersionMounted(): void {
  for (const version of API_VERSIONS) {
    if (!VERSION_MOUNTS[version]?.length) {
      throw new Error(`API version "${version}" has no route manifest`);
    }
  }
}
