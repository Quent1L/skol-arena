import type { APIRoute } from 'astro'
import { SITE, canonicalUrl } from '../lib/site'
import { getDocsPages } from '../lib/docs-pages'
import { getPosts } from '../lib/posts'
import { getReleases, releaseAnchor } from '../lib/changelog'

/**
 * Root-relative Markdown links to absolute ones. The bodies are written for a
 * reader who is already on the site; a model reading this file standalone has no
 * origin to resolve `/docs/deployment` against.
 */
function absolutise(markdown: string, site: URL | undefined): string {
  return markdown.replace(
    /\]\((\/[^)\s]*)\)/g,
    (_, path: string) => `](${canonicalUrl(path, site)})`,
  )
}

/**
 * Images to their alt text. Changelog images are relative paths that Astro rewrites
 * to hashed asset URLs at build time; the source path means nothing outside the repo.
 */
function stripImages(markdown: string): string {
  return markdown.replace(/!\[([^\]]*)\]\([^)]*\)/g, (_, alt: string) =>
    alt ? `(Image: ${alt})` : '',
  )
}

/**
 * The whole documentation, blog and changelog as one Markdown file, so a model can ingest
 * everything in a single fetch rather than following the links in llms.txt.
 *
 * Bodies come straight from source, so they stay in sync by construction. Blog
 * posts go through getPosts(), which already drops drafts from the build.
 */
export const GET: APIRoute = async ({ site }) => {
  const url = (path: string) => canonicalUrl(path, site)
  const posts = await getPosts()
  const releases = await getReleases()

  const sections = [
    ...getDocsPages().map(
      (page) => `# ${page.title}

Source: ${url(page.path)}
${page.description ? `\n${page.description}\n` : ''}
${absolutise(page.body, site)}`,
    ),
    ...posts.map(
      (post) => `# ${post.data.title}

Source: ${url(`/blog/${post.id}`)}
Published: ${post.data.date.toISOString().slice(0, 10)}

${post.data.description}

${absolutise(post.body?.trim() ?? '', site)}`,
    ),
    ...releases.map(
      (release) => `# What's new in version ${release.data.version}

Source: ${url('/changelog')}#${releaseAnchor(release.data.version)}
Published: ${release.data.date.toISOString().slice(0, 10)}
${release.data.summary ? `\n${release.data.summary}\n` : ''}
${stripImages(absolutise(release.body?.trim() ?? '', site))}`,
    ),
  ]

  const body = `# ${SITE.name} — full documentation

> ${SITE.description}

Generated from ${url('/')}. A shorter, link-only index lives at ${url('/llms.txt')}.

---

${sections.join('\n\n---\n\n')}
`

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
