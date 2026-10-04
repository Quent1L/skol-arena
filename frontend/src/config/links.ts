/**
 * Public showcase site. Every instance, self-hosted or not, links to the official one.
 * Must match `site` in `docs/astro.config.mjs` — `scripts/__tests__/site.test.ts` checks it.
 */
export const SITE_URL = 'https://skol-arena.com'

/** Functional release notes of a version, anchored on its section. */
export function changelogUrl(version: string): string {
  return `${SITE_URL}/changelog#v${version}`
}
