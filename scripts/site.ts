/**
 * Origine publique du site vitrine. Doit rester égale au `site` de `docs/astro.config.mjs`
 * (et à `SITE_URL` de `frontend/src/config/links.ts`) : `site.test.ts` le vérifie, pour
 * qu'une migration de domaine ne laisse pas de lien mort dans les releases GitHub.
 */
export const SITE_URL = 'https://skol-arena.com'

/** Lien vers les notes fonctionnelles d'une version, ancré sur sa section. */
export function changelogUrl(version: string): string {
  return `${SITE_URL}/changelog#v${version}`
}
