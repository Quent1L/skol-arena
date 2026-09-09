import { describe, it, expect } from "bun:test";

import { buildVersionApp } from "../build";
import { generateVersionSpec } from "../openapi";

/**
 * Guards against the gap that produced most of the findings in the security audit:
 * `describe({ role: true })` only ever wrote a 403 into the OpenAPI document. A
 * route could advertise a permission check it did not perform, and nothing — not a
 * type, not a test, not a review — would notice.
 *
 * These tests tie the two together in both directions: a documented 403 must be
 * backed by something, and a real role guard must be documented.
 */

type Operation = { responses?: Record<string, unknown> };
type Spec = { paths: Record<string, Record<string, Operation>> };

type RouterRow = { path: string; method: string; handler: { name?: string } };

const OPERATION_KEYS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

/**
 * Routes whose 403 comes from the service layer rather than from a middleware, and
 * so cannot be seen by walking the router. Every entry names what enforces it.
 *
 * Adding a line here is a deliberate act: it asserts you followed the handler into
 * the service and found a real check. If you cannot name one, the route is not
 * enforcing anything and the fix is a guard, not an entry.
 */
const SERVICE_ENFORCED = new Map<string, string>([
  // tournamentService.canManageTournament — owner, co_admin or super_admin
  ["PATCH /tournaments/:id", "tournamentService.checkUpdatePermissions"],
  ["PATCH /tournaments/:id/status", "tournamentService.checkUpdatePermissions"],
  ["DELETE /tournaments/:id", "tournamentService.deleteTournament"],
  ["POST /tournaments/:id/participants/add", "tournamentService.adminAddParticipant"],
  ["DELETE /tournaments/:id/participants/:userId", "tournamentService.adminRemoveParticipant"],
  ["DELETE /tournaments/:id/cache", "standingsService.clearCache"],
  ["POST /tournaments/:id/recalculate-points", "standingsService.recalculatePoints"],
  ["POST /tournaments/:id/bracket", "bracketService.generateBracket"],
  ["DELETE /tournaments/:id/bracket", "bracketService.deleteBracket"],

  // tournamentService.assertCanAccess / assertOrganizationAccess — organization scoping
  ["GET /tournaments/:id", "assertTournamentAccess"],
  ["GET /tournaments/:id/available-badges", "assertTournamentAccess"],
  ["GET /tournaments/:id/participants", "assertTournamentAccess"],
  ["GET /tournaments/:id/standings/official", "assertTournamentAccess"],
  ["GET /tournaments/:id/standings/provisional", "assertTournamentAccess"],
  ["GET /tournaments/:id/stats", "assertTournamentAccess"],
  ["GET /tournaments/:id/bracket", "assertTournamentAccess"],
  ["GET /tournaments/:id/bracket/can-generate", "assertTournamentAccess"],
  ["GET /tournaments/:id/editability", "assertTournamentAccess"],
  ["GET /tournaments/:id/ruleset", "assertTournamentAccess"],
  ["GET /tournaments/:id/teams", "tournamentService.assertCanAccess"],
  ["POST /tournaments/:id/participants", "tournamentService.joinTournament"],
  ["GET /matches/:id", "tournamentService.assertCanAccess"],

  // teamService — the route computes isAdmin, the service refuses without it
  ["POST /tournaments/:id/teams", "teamService.createTeam"],
  ["POST /tournaments/:id/teams/:teamId/join", "teamService.joinTeam"],
  ["DELETE /tournaments/:id/teams/:teamId/leave", "teamService.leaveTeam"],
  ["DELETE /tournaments/:id/teams/:teamId", "teamService.deleteTeam"],

  // matchService — participant or organizer, depending on the action
  ["POST /matches", "matchPermissionValidator.checkCreatePermissions"],
  ["PATCH /matches/:id", "matchService.runUpdateValidations"],
  ["DELETE /matches/:id", "matchService.deleteMatch"],
  ["POST /matches/:id/report", "matchService.validateReportPermissions"],
  ["POST /matches/:id/confirm", "matchService.confirmMatch"],
  ["POST /matches/:id/contest", "matchService.contestMatch"],
  ["POST /matches/:id/respond", "matchService.respondToMatch"],
  ["POST /matches/:id/cancel", "matchService.cancelMatch"],
  ["POST /matches/:id/finalize", "matchService.canManageMatches, checked in the handler"],
  ["GET /matches/:id/messages", "matchMessageService.assertCanRead"],
  ["POST /matches/:id/messages", "matchMessageService.assertCanRead"],

  // rankedSeasonService.assertCanManage — super_admin or tournament_admin
  ["POST /ranked/seasons", "rankedSeasonService.createSeason"],
  ["PATCH /ranked/seasons/:id", "rankedSeasonService.updateSeason"],
  ["POST /ranked/seasons/:id/start", "rankedSeasonService.startSeason"],
  ["POST /ranked/seasons/:id/end", "rankedSeasonService.endSeason"],
  ["POST /ranked/seasons/:id/tiers", "rankedSeasonService.createTier"],
  ["PATCH /ranked/seasons/:id/tiers/:level", "rankedSeasonService.updateTier"],
  ["DELETE /ranked/seasons/:id/tiers/:level", "rankedSeasonService.deleteTier"],
  ["POST /ranked/seasons/:id/tiers/recalculate", "rankedSeasonService.recalculateTiers"],
  ["POST /ranked/seasons/:id/rewind/regenerate", "rankedSeasonService.regenerateRewind"],

  // gameRulesService.assertCanManage
  ["POST /game-rules", "gameRulesService.createGameRule"],
  ["PATCH /game-rules/:id", "gameRulesService.updateGameRule"],
  ["DELETE /game-rules/:id", "gameRulesService.deleteGameRule"],

  // Checked inline in the handler against the caller's role
  ["GET /users", "inline super_admin / tournament_admin check"],
]);

/** OpenAPI writes `{id}` where Hono writes `:id`. */
const toHonoPath = (path: string) => path.replace(/\{([^}]+)\}/g, ":$1");

function routerRows(): RouterRow[] {
  // `routes` is public on the Hono instance but absent from AppHonoOptional's
  // narrowed type, so it is read through the base shape rather than any.
  return (buildVersionApp("v1") as unknown as { routes: RouterRow[] }).routes;
}

/** Every handler name registered for a route, wildcard middleware included. */
function guardsFor(rows: RouterRow[], method: string, path: string): Set<string> {
  const names = new Set<string>();

  for (const row of rows) {
    if (row.method !== "ALL" && row.method !== method) continue;

    // A sub-app's `use("*", …)` is mounted as `/prefix/*`, and Hono applies it to
    // the mount root itself as well as to everything under it — so `/admin/users`
    // is covered by `/admin/users/*`, not just `/admin/users/:id`.
    const prefix = row.path.endsWith("/*") ? row.path.slice(0, -2) : null;
    const matches =
      prefix !== null
        ? path === prefix || path.startsWith(`${prefix}/`)
        : row.path === path;

    if (matches && row.handler?.name) names.add(row.handler.name);
  }

  return names;
}

async function documentedOperations(): Promise<
  Array<{ method: string; path: string; declares403: boolean }>
> {
  const spec = (await generateVersionSpec("v1")) as Spec;

  return Object.entries(spec.paths).flatMap(([path, item]) =>
    Object.entries(item)
      .filter(([key]) => OPERATION_KEYS.includes(key))
      .map(([method, operation]) => ({
        method: method.toUpperCase(),
        path: toHonoPath(path),
        declares403: operation.responses?.["403"] !== undefined,
      })),
  );
}

describe("route guards", () => {
  it("backs every documented 403 with a real check", async () => {
    const rows = routerRows();
    const operations = await documentedOperations();
    expect(operations.length).toBeGreaterThan(0);

    const unenforced = operations
      .filter((op) => op.declares403)
      .filter((op) => !guardsFor(rows, op.method, op.path).has("requireSuperAdmin"))
      .filter((op) => !SERVICE_ENFORCED.has(`${op.method} ${op.path}`))
      .map((op) => `${op.method} ${op.path}`);

    // A route landing here declares a 403 it will never send. Either give it a role
    // guard, or add it to SERVICE_ENFORCED naming the service check that covers it.
    expect(unenforced).toEqual([]);
  });

  it("documents every route that carries a role guard", async () => {
    const rows = routerRows();
    const operations = await documentedOperations();

    const undocumented = operations
      .filter((op) => guardsFor(rows, op.method, op.path).has("requireSuperAdmin"))
      .filter((op) => !op.declares403)
      .map((op) => `${op.method} ${op.path}`);

    // The same drift, the other way round: the guard is real but the spec hides it,
    // so a client cannot know a 403 is on the table. Add `role: true` to describe().
    expect(undocumented).toEqual([]);
  });

  it("keeps the allowlist honest", async () => {
    const operations = await documentedOperations();
    const documented = new Set(
      operations.filter((op) => op.declares403).map((op) => `${op.method} ${op.path}`),
    );

    // An entry that no longer matches a 403-declaring route is stale: the route was
    // renamed, removed, or lost its `role: true`. Left alone it would silently
    // excuse a future route that happens to reuse the path.
    const stale = [...SERVICE_ENFORCED.keys()].filter((entry) => !documented.has(entry));
    expect(stale).toEqual([]);
  });
});
