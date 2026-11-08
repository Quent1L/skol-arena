import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { CollectionEntry } from 'astro:content'
import { SITE, canonicalUrl } from './site'

/**
 * Schema.org nodes, assembled into a single `@graph` per page by Seo.astro.
 *
 * Every builder takes the site origin so the `@id` anchors stay absolute, and
 * nodes point at each other by `@id` rather than repeating themselves — one
 * Organization definition per page, referenced from the WebSite, the articles
 * and the posts.
 */
export type SchemaNode = Record<string, unknown>

export const organizationId = (site: URL | undefined) => `${canonicalUrl('/', site)}#organization`
export const webSiteId = (site: URL | undefined) => `${canonicalUrl('/', site)}#website`

export function organization(site: URL | undefined): SchemaNode {
  return {
    '@type': 'Organization',
    '@id': organizationId(site),
    name: SITE.name,
    url: canonicalUrl('/', site),
    description: SITE.description,
    logo: {
      '@type': 'ImageObject',
      url: new URL(SITE.ogImage, canonicalUrl('/', site)).href,
      width: SITE.ogImageSize.width,
      height: SITE.ogImageSize.height,
    },
    sameAs: [SITE.repo, SITE.docker],
  }
}

export function webSite(site: URL | undefined): SchemaNode {
  return {
    '@type': 'WebSite',
    '@id': webSiteId(site),
    url: canonicalUrl('/', site),
    name: SITE.name,
    description: SITE.description,
    inLanguage: 'en',
    publisher: { '@id': organizationId(site) },
    // No `potentialAction`/SearchAction on purpose: Pagefind runs client-side
    // and there is no `?q=` route to hand Google, so declaring one would point
    // at a URL that does not exist.
  }
}

/**
 * The release shown on the site comes from the monorepo root package.json, which
 * release-it bumps — same source as the version badge on the homepage, so the two
 * can never disagree. Astro runs with docs/ as cwd, hence the `..`.
 */
function currentVersion(): string {
  const rootPackage = resolve(process.cwd(), '../package.json')
  const { version } = JSON.parse(readFileSync(rootPackage, 'utf-8')) as { version: string }
  return version
}

export function softwareApplication(site: URL | undefined): SchemaNode {
  return {
    '@type': 'SoftwareApplication',
    '@id': `${canonicalUrl('/', site)}#software`,
    name: SITE.name,
    description: SITE.description,
    url: canonicalUrl('/', site),
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Competitive community platform',
    operatingSystem: 'Docker, Linux, macOS, Windows',
    softwareVersion: currentVersion(),
    license: SITE.license,
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    author: { '@id': organizationId(site) },
    featureList: [
      'Ranked seasons with a persistent MMR ladder and population-based tiers',
      'Ranked seasons that start fresh or carry the previous MMR over with a soft reset',
      'Championship leagues with persistent standings and fairness limits',
      'Elimination brackets seeded at random or from a finished championship',
      'Player-reported matches with configurable validation per tournament',
      'Player profiles, head-to-head comparison and cross-tournament statistics',
      'Self-hosted via a single Docker image',
    ],
    // The category the product deliberately does not *claim* still has to be
    // findable: the prose above positions it, these keep it searchable.
    keywords: [
      'tournament software',
      'tournament management',
      'league management',
      'ranked ladder',
      'MMR',
      'championship',
      'bracket',
      'self-hosted',
      'open source',
    ],
  }
}

/**
 * Markdown body to the plain sentence a FAQ answer has to be: schema.org wants
 * text, and the raw source carries link syntax and emphasis markers that would
 * otherwise be read literally.
 */
export function mdToText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\][]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[ \t]*[-*+][ \t]+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function faqPage(
  entries: CollectionEntry<'showcase'>[],
  site: URL | undefined,
  pathname: string,
): SchemaNode {
  return {
    '@type': 'FAQPage',
    '@id': `${canonicalUrl(pathname, site)}#faq`,
    mainEntity: entries.map((entry) => ({
      '@type': 'Question',
      name: entry.data.title,
      acceptedAnswer: { '@type': 'Answer', text: mdToText(entry.body ?? '') },
    })),
  }
}

export function techArticle(
  article: { title: string; description?: string },
  site: URL | undefined,
  pathname: string,
): SchemaNode {
  const url = canonicalUrl(pathname, site)
  return {
    '@type': 'TechArticle',
    '@id': `${url}#article`,
    headline: article.title,
    description: article.description,
    url,
    inLanguage: 'en',
    isPartOf: { '@id': webSiteId(site) },
    author: { '@id': organizationId(site) },
    publisher: { '@id': organizationId(site) },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  }
}

export function blogPosting(
  post: CollectionEntry<'blog'>,
  site: URL | undefined,
  pathname: string,
): SchemaNode {
  const url = canonicalUrl(pathname, site)
  return {
    '@type': 'BlogPosting',
    '@id': `${url}#post`,
    headline: post.data.title,
    description: post.data.description,
    url,
    datePublished: post.data.date.toISOString(),
    inLanguage: 'en',
    image: new URL(SITE.ogImage, canonicalUrl('/', site)).href,
    author: { '@id': organizationId(site) },
    publisher: { '@id': organizationId(site) },
    isPartOf: { '@id': webSiteId(site) },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    ...(post.data.tag ? { keywords: [post.data.tag] } : {}),
  }
}

export function breadcrumbs(
  trail: { name: string; path: string }[],
  site: URL | undefined,
): SchemaNode {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((step, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: step.name,
      item: canonicalUrl(step.path, site),
    })),
  }
}
