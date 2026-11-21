import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'astro/zod'
import { readNotes, renderNotes } from '../../scripts/apply-release-notes'

const UNRELEASED_DIR = new URL('../release-notes/unreleased/', import.meta.url)

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

// Dev-only preview of the next release: the pending notes, assembled exactly as
// scripts/apply-release-notes.ts will publish them. Empty in a build, like a draft post.
const unreleased = defineCollection({
  loader: {
    name: 'unreleased-notes',
    async load({ store, renderMarkdown, watcher }) {
      const sync = async () => {
        store.clear()
        const notes = import.meta.env.DEV ? readNotes(UNRELEASED_DIR.pathname) : []
        if (notes.length === 0) return
        // fileURL inside the folder: relative image paths resolve as the note author wrote them.
        const rendered = await renderMarkdown(renderNotes(notes), {
          fileURL: new URL('unreleased.md', UNRELEASED_DIR),
        })
        store.set({ id: 'unreleased', data: { count: notes.length }, rendered })
      }
      watcher?.add(UNRELEASED_DIR.pathname)
      watcher?.on('all', (_, path) => {
        if (path.startsWith(UNRELEASED_DIR.pathname)) void sync()
      })
      await sync()
    },
  },
  schema: z.object({ count: z.number() }),
})

export const collections = { showcase, blog, changelog, unreleased }
