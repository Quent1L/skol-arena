import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vueDevTools from 'vite-plugin-vue-devtools'
import Components from 'unplugin-vue-components/vite'
import { PrimeVueResolver } from '@primevue/auto-import-resolver'
import { existsSync, readFileSync } from 'node:fs'
const version = readFileSync(new URL('../VERSION', import.meta.url), 'utf-8').trim()

// Lowest version a client is allowed to keep running. Written by the release
// pipeline (scripts/apply-force-update.ts), never by hand. Optional on purpose:
// a checkout predating the file must still build.
const minVersionPath = new URL('../MIN_VERSION', import.meta.url)
const minVersion = existsSync(minVersionPath)
  ? readFileSync(minVersionPath, 'utf-8').trim() || null
  : null

// Latest version that shipped functional release notes. Written by the release
// pipeline (scripts/apply-release-notes.ts), never by hand. Read from the repo root
// rather than from docs/: the Docker build context excludes docs/ and every *.md.
const notesVersionPath = new URL('../NOTES_VERSION', import.meta.url)
const notesVersion = existsSync(notesVersionPath)
  ? readFileSync(notesVersionPath, 'utf-8').trim()
  : ''

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __NOTES_VERSION__: JSON.stringify(notesVersion),
  },
  plugins: [
    {
      // Exposes the current version over HTTP: the client compares it against
      // __APP_VERSION__ to detect a deployment without waiting on the service
      // worker lifecycle. Emitted at build time rather than kept in public/ so it
      // cannot drift from ../VERSION.
      // `minVersion` rides along in the same payload so deciding whether the update
      // is blocking costs no extra request.
      name: 'emit-version-json',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ version, minVersion }),
        })
      },
    },
    tailwindcss(),
    vue(),
    Components({
      resolvers: [PrimeVueResolver()],
    }),
    vueDevTools({ launchEditor: 'webstorm' }),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        // Fonts belong in the precache alongside the CSS that references them. Left out,
        // they are the only asset a page still served by the previous worker fetches from
        // the network — where their content-hashed filename no longer exists after a
        // deployment that changed the font bytes. Icons then render as tofu until reload.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
      },
      devOptions: {
        // Disabled during e2e runs: the dev service worker caches bundles and
        // interferes with Playwright.
        enabled: !process.env.VITE_E2E,
        type: 'module',
      },
      manifest: {
        name: 'Skol Arena',
        short_name: 'Skol Arena',
        description: 'Skill Or Luck ?',
        theme_color: '#000006',
        // The black the icons are cut out of. Android paints its own splash from
        // this colour plus the 512 icon, so matching it is what makes the native
        // splash, the pre-mount screen and SplashLoader one continuous surface.
        background_color: '#000006',
        display: 'standalone',
        // Chromium only ever reads these four. 192 is the Android launcher icon;
        // 512 drives the install prompt, the splash, and every intermediate size,
        // which the browser downscales itself. Listing 48/72/96/128/144/256/384
        // just ships bytes nobody reads, and 152 is an iOS size that Safari does
        // not take from the manifest at all — it uses the apple-touch-icon link
        // in index.html. An SVG entry would never beat the 512 PNG either.
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Maskable art keeps the mark inside the safe zone, so Android adaptive
          // icons can crop to any shape without clipping the logo.
          {
            src: '/icons/maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    // Every prosemirror package depends on its siblings, and any lockfile that nests one
    // copy under another gets a *second* module instance in the bundle — the editor chunk
    // once shipped prosemirror-model five times and prosemirror-transform six times, which
    // was most of its 613 kB. Root `overrides` flatten node_modules; this keeps a future
    // install from silently re-nesting. It is also a correctness guard: prosemirror checks
    // Schema/Node identity with `instanceof`, which breaks across two copies.
    dedupe: [
      'prosemirror-model',
      'prosemirror-transform',
      'prosemirror-view',
      'prosemirror-state',
      '@tiptap/core',
      '@tiptap/pm',
    ],
  },
  server: {
    watch: {
      // The watcher only skips node_modules and .git by default, so it walks
      // generated artifacts too. Coverage reports alone are hundreds of HTML
      // files, and watching them makes Bun's fs.watch throw EINVAL, which kills
      // the dev server. None of these are ever served in dev.
      // shared/dist is deliberately NOT ignored: it is what @skol-arena/shared
      // resolves to, and watching it is what reloads the app after a shared rebuild.
      ignored: [
        '**/coverage/**',
        '**/playwright-report/**',
        '**/test-results/**',
        '**/dev-dist/**',
        '**/.code-review-graph/**',
      ],
    },
  },
  optimizeDeps: {
    // Also scans the router's lazy views: otherwise vite discovers their
    // dependencies on first navigation and triggers a full reload
    // ("optimized dependencies changed") that breaks the ongoing navigation.
    entries: ['index.html', 'src/views/**/*.vue'],
  },
})
