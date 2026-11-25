import { execSync } from 'node:child_process'

/**
 * Purges mutations from previous runs: matches created by tests
 * (random ids, unlike seeded fixtures prefixed "e2e")
 * are neither deletable nor cancellable via the API once finalized, and
 * trigger the "already a match at this date and time" check (same minute)
 * on subsequent runs.
 *
 * Also drops every announcement (their views and feed copies cascade): an app-wide
 * pop-up left pending by a crashed run is a modal that would cover every other spec.
 */
export default function globalSetup() {
  const sql = `
    DELETE FROM matches
    WHERE tournament_id IN ('e2e00000-0000-4000-8000-00000000f001', 'e2e00000-0000-4000-8000-00000000f003')
      AND id::text NOT LIKE 'e2e%';
    DELETE FROM announcements;
  `
  try {
    execSync(
      `docker exec skol-postgres-e2e psql -U skolarena -d skolarena_e2e -c "${sql.replace(/\s+/g, ' ').trim()}"`,
      { stdio: 'pipe' },
    )
  } catch (err) {
    throw new Error(
      `Unable to purge the e2e database — is the skol-postgres-e2e container running? (bun run e2e:db:up)\n${err}`,
    )
  }
}
