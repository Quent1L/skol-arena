import type { Plugin, Rollup } from 'vite'

/**
 * Keeps the admin screens out of the PWA precache.
 *
 * Every player installs the precache, but only a handful of people ever open the
 * admin area — and it carries the heaviest chunks of the app (the rich text editor,
 * the icon picker, the rules engine forms). Those are fetched on demand instead, from
 * the network and the browser's HTTP cache. A deployment can then remove a chunk an
 * open tab still points at: `composables/pwa/stale-chunk.ts` reloads onto the new
 * version when that import fails.
 *
 * A chunk is admin-only when nothing outside `src/views/admin/` reaches it: walking the
 * import graph from the entry, every dynamic import of an admin view is a door we do
 * not go through. Whatever stays unreached — the views themselves and the libraries
 * only they use — is dropped from the manifest, along with the CSS only they import.
 */

const ADMIN_VIEWS_DIR = '/src/views/admin/'

type ManifestEntry = { url: string; revision: string | null; size: number }
type ManifestTransform = (entries: ManifestEntry[]) => {
  manifest: ManifestEntry[]
  warnings: string[]
}

function isAdminView(chunk: Rollup.OutputChunk | undefined): boolean {
  return chunk?.facadeModuleId?.includes(ADMIN_VIEWS_DIR) ?? false
}

function importedCss(chunk: Rollup.OutputChunk | undefined): string[] {
  return [...(chunk?.viteMetadata?.importedCss ?? [])]
}

function reachableFromApp(chunks: Map<string, Rollup.OutputChunk>): Set<string> {
  const reached = new Set<string>()
  const pending = [...chunks.values()].filter((c) => c.isEntry).map((c) => c.fileName)
  while (pending.length > 0) {
    const chunk = chunks.get(pending.pop()!)
    if (!chunk || reached.has(chunk.fileName)) continue
    reached.add(chunk.fileName)
    pending.push(...chunk.imports)
    pending.push(...chunk.dynamicImports.filter((file) => !isAdminView(chunks.get(file))))
  }
  return reached
}

export function findAdminOnlyFiles(bundle: Rollup.OutputBundle): string[] {
  const chunks = new Map<string, Rollup.OutputChunk>()
  for (const output of Object.values(bundle)) {
    if (output.type === 'chunk') chunks.set(output.fileName, output)
  }
  const reached = reachableFromApp(chunks)
  const appCss = new Set([...reached].flatMap((file) => importedCss(chunks.get(file))))
  const adminOnly: string[] = []
  for (const chunk of chunks.values()) {
    if (reached.has(chunk.fileName)) continue
    adminOnly.push(chunk.fileName, ...importedCss(chunk).filter((css) => !appCss.has(css)))
  }
  return adminOnly
}

/**
 * The plugin records the admin-only files while the app is bundled; the transform,
 * handed to `injectManifest.manifestTransforms`, drops them once the precache list is
 * built — which happens after the bundle is written.
 */
export function adminPrecacheScope(): { plugin: Plugin; manifestTransform: ManifestTransform } {
  const adminOnly = new Set<string>()
  const plugin: Plugin = {
    name: 'admin-precache-scope',
    apply: 'build',
    generateBundle(_options, bundle) {
      adminOnly.clear()
      for (const file of findAdminOnlyFiles(bundle)) adminOnly.add(file)
    },
  }
  const manifestTransform: ManifestTransform = (entries) => ({
    manifest: entries.filter((entry) => !adminOnly.has(entry.url)),
    warnings: [],
  })
  return { plugin, manifestTransform }
}
