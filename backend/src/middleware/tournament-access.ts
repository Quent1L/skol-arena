import type { Context, Next } from "hono";
import { tournamentService } from "../services/tournament.service";
import { resolveOptionalViewer } from "./auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Applies the organization rule to every route under a competition id, so a route
 * added later cannot forget it. A segment that is not an id (`/seasons/finished`)
 * is a sibling route sharing the pattern, not a competition, and passes through.
 */
export function requireTournamentAccess(param = "id") {
  return async (c: Context, next: Next) => {
    const tournamentId = c.req.param(param);
    if (tournamentId && UUID.test(tournamentId)) {
      await tournamentService.assertCanAccess(tournamentId, await resolveOptionalViewer(c));
    }
    await next();
  };
}
