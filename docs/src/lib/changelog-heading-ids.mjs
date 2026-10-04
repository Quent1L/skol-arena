import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Every version on /changelog has the same "New", "Improved" and "Fixed" headings, and the
 * default slugger restarts per entry, so the single page would carry each id dozens of
 * times: invalid HTML, and Pagefind deep links landing on whichever version came first.
 * Changelog headings get their version in front (`v2.0.4-fixed`); Astro's own heading pass
 * runs after user plugins and keeps an id that is already set.
 *
 * A Sätteri hast plugin, not a rehype one: Astro 7's default Markdown processor no longer
 * runs `markdown.rehypePlugins`. The version comes from the file name, which
 * scripts/apply-release-notes.ts writes as `<version>.md`.
 */
function slug(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function changelogVersion(fileURL) {
  if (!fileURL) return null
  const path = fileURLToPath(fileURL)
  return path.includes('/content/changelog/') ? basename(path, '.md') : null
}

export function changelogHeadingIds({ fileURL }) {
  const version = changelogVersion(fileURL)
  if (!version) return null
  const seen = new Map()
  return {
    name: 'changelog-heading-ids',
    element: {
      filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
      visit(node, ctx) {
        const base = `v${version}-${slug(ctx.textContent(node))}`
        const count = seen.get(base) ?? 0
        seen.set(base, count + 1)
        ctx.setProperty(node, 'id', count ? `${base}-${count}` : base)
      },
    },
  }
}
