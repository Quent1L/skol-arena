import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'
import pagefind from 'astro-pagefind'
import sitemap from '@astrojs/sitemap'
import { satteri } from '@astrojs/markdown-satteri'
import { changelogHeadingIds } from './src/lib/changelog-heading-ids.mjs'

export default defineConfig({
  // The single source for the site origin. Everything absolute the site emits —
  // canonical tags, og:url, the sitemap, JSON-LD @id anchors, llms.txt links —
  // derives from this via Astro.site, so a domain migration is a one-line edit.
  site: 'https://skol-arena.com',
  // build.format stays at its `directory` default, so a route answers at both
  // /about and /about/. This settles which of the two the site links to and
  // reports; the canonical tag is what actually deduplicates them for crawlers.
  trailingSlash: 'never',
  markdown: {
    processor: satteri({ hastPlugins: [changelogHeadingIds] }),
  },
  integrations: [
    pagefind(),
    sitemap({
      serialize(item) {
        const path = new URL(item.url).pathname.replace(/\/+$/, '')
        if (path === '') return { ...item, priority: 1.0, changefreq: 'weekly' }
        if (path.startsWith('/docs')) return { ...item, priority: 0.8, changefreq: 'weekly' }
        if (path === '/changelog') return { ...item, priority: 0.7, changefreq: 'weekly' }
        if (path.startsWith('/blog/')) return { ...item, priority: 0.6, changefreq: 'monthly' }
        return { ...item, priority: 0.7, changefreq: 'monthly' }
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    server: {
      watch: {
        // Same rationale as frontend/vite.config.ts: the watcher only skips
        // node_modules and .git by default, so it walks generated artifacts and
        // burns inotify watches until the dev server dies with ENOSPC.
        // dist/ is still *served* (Pagefind reads its index from there) — only
        // change detection is dropped.
        ignored: ['**/coverage/**', '**/dist/**', '**/.astro/**', '**/.code-review-graph/**'],
      },
    },
  },
})
