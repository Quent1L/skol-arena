import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'astro/zod'

const showcase = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/showcase' }),
  schema: z.object({
    title: z.string(),
    summary: z.string().optional(),
    order: z.number().default(0),
    icon: z.string().optional(),
    badge: z.string().optional(),
    pillar: z.enum(['championship', 'bracket', 'ranked', 'platform']).optional(),
    tagline: z.string().optional(),
    bestFor: z.array(z.string()).optional(),
    docs: z.string().optional(),
  }),
})

// Unlike showcase, whose entries are fragments pulled into pages, a blog entry *is*
// a page: src/pages/blog/[...slug].astro routes it.
const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    tag: z.string().optional(),
    version: z.string().optional(),
    draft: z.boolean().default(false),
  }),
})

// Functional release notes, one entry per version. Written by
// scripts/apply-release-notes.ts at release time from docs/release-notes/unreleased/ —
// never by hand, except the backfill of versions published before that existed.
const changelog = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/changelog' }),
  schema: z.object({
    version: z.string(),
    date: z.coerce.date(),
    summary: z.string().optional(),
  }),
})

export const collections = { showcase, blog, changelog }
