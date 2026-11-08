/**
 * Identity strings shared by the metadata tags and the JSON-LD builders.
 *
 * The absolute origin lives in `astro.config.mjs` as `site` and is read back at
 * runtime from `Astro.site` (or the `site` argument an endpoint receives). The
 * literal below is only the fallback for the case where neither is set, so a
 * domain migration is these two lines and nothing else.
 */
export const SITE = {
  name: 'Skol Arena',
  tagline: 'Skill Or Luck?',
  // The first sentence is load-bearing: Seo.astro builds the homepage <title> as
  // `${name} — ${description.split('.')[0]}`, so it has to stand alone and stay
  // short enough to survive as a title. Reposition freely, but keep that shape.
  description:
    'Open-source platform for persistent competitive communities. Self-hostable — run championships, ranked ladders and elimination brackets, with player profiles, rankings and statistics in one place.',
  repo: 'https://github.com/Quent1L/skol-arena',
  docker: 'https://hub.docker.com/r/quent1l/skol-arena',
  license: 'https://www.gnu.org/licenses/agpl-3.0.html',
  // A 512x512 app icon, not a 1200x630 card: the tags below declare its real
  // dimensions and pair it with a `summary` Twitter card, so it renders as a
  // square thumbnail instead of a stretched banner. Swapping in a proper card
  // later is a change to these two fields plus the file.
  ogImage: '/icon-512.png',
  ogImageSize: { width: 512, height: 512 },
  // Google Search Console ownership proof. Must stay on every page: Search
  // Console re-checks the tag long after the first verification, and dropping
  // it silently un-verifies the property. The token is bound to one property,
  // so a domain move needs a new one registered for the new origin.
  googleSiteVerification: '8w4ueGA3JRr4_oPIK7k3WhgTfTFzEiRx3TjmJ8o8RPY',
} as const

/**
 * Absolute, trailing-slash-free URL for a pathname.
 *
 * `build.format` is Astro's `directory` default, so every route is emitted as
 * `<name>/index.html` and answers at both `/about` and `/about/`. Collapsing the
 * two onto one indexed URL is exactly what the canonical tag is for, so every
 * absolute URL the site emits — canonical, og:url, sitemap, JSON-LD @id — goes
 * through here and agrees on the no-slash form.
 */
export function canonicalUrl(pathname: string, site: URL | undefined): string {
  const origin = site ?? new URL('https://skol-arena.com')
  let end = pathname.length
  while (end > 0 && pathname[end - 1] === '/') end--
  const trimmed = pathname.slice(0, end)
  return new URL(trimmed || '/', origin).href
}
