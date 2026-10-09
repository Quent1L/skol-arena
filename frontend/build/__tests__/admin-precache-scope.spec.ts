import { describe, it, expect } from 'vitest'
import type { Rollup } from 'vite'
import { adminPrecacheScope, findAdminOnlyFiles } from '../admin-precache-scope'

type ChunkSpec = {
  facade?: string
  entry?: boolean
  imports?: string[]
  dynamicImports?: string[]
  css?: string[]
}

function bundleOf(specs: Record<string, ChunkSpec>): Rollup.OutputBundle {
  const bundle: Record<string, unknown> = {}
  for (const [fileName, spec] of Object.entries(specs)) {
    bundle[fileName] = {
      type: 'chunk',
      fileName,
      isEntry: spec.entry ?? false,
      facadeModuleId: spec.facade ?? null,
      imports: spec.imports ?? [],
      dynamicImports: spec.dynamicImports ?? [],
      viteMetadata: { importedCss: new Set(spec.css ?? []), importedAssets: new Set() },
    }
  }
  bundle['assets/index.css'] = { type: 'asset', fileName: 'assets/index.css' }
  return bundle as Rollup.OutputBundle
}

const bundle = bundleOf({
  'assets/index.js': {
    entry: true,
    facade: '/app/src/main.ts',
    imports: ['assets/vue.js'],
    dynamicImports: ['assets/Home.js', 'assets/AdminLayout.js', 'assets/UsersList.js'],
    css: ['assets/index.css'],
  },
  'assets/vue.js': {},
  'assets/Home.js': { facade: '/app/src/views/Home.vue', imports: ['assets/Button.js'] },
  'assets/Button.js': {},
  'assets/AdminLayout.js': {
    facade: '/app/src/views/admin/AdminLayout.vue',
    imports: ['assets/Button.js'],
  },
  'assets/UsersList.js': {
    facade: '/app/src/views/admin/UsersList.vue',
    imports: ['assets/AdminTable.js'],
    dynamicImports: ['assets/Editor.js'],
    css: ['assets/index.css'],
  },
  'assets/AdminTable.js': {},
  'assets/Editor.js': { facade: '/app/src/components/Editor.vue', css: ['assets/Editor.css'] },
})

describe('findAdminOnlyFiles', () => {
  it('drops admin views and what only they reach, keeps what the app shares with them', () => {
    expect(findAdminOnlyFiles(bundle).sort()).toEqual([
      'assets/AdminLayout.js',
      'assets/AdminTable.js',
      'assets/Editor.css',
      'assets/Editor.js',
      'assets/UsersList.js',
    ])
  })

  it('keeps a component an app view also loads', () => {
    const shared = bundleOf({
      'assets/index.js': {
        entry: true,
        dynamicImports: ['assets/Rules.js', 'assets/AdminRules.js'],
      },
      'assets/Rules.js': {
        facade: '/app/src/views/RulesView.vue',
        dynamicImports: ['assets/Editor.js'],
      },
      'assets/AdminRules.js': {
        facade: '/app/src/views/admin/GameRulesFormView.vue',
        dynamicImports: ['assets/Editor.js'],
      },
      'assets/Editor.js': {},
    })
    expect(findAdminOnlyFiles(shared)).toEqual(['assets/AdminRules.js'])
  })
})

describe('adminPrecacheScope', () => {
  it('filters the precache manifest with what the last bundle recorded', () => {
    const { plugin, manifestTransform } = adminPrecacheScope()
    const hook = plugin.generateBundle as (options: unknown, bundle: Rollup.OutputBundle) => void
    hook.call({}, {}, bundle)
    const entry = (url: string) => ({ url, revision: null, size: 1 })
    const { manifest } = manifestTransform([entry('assets/index.js'), entry('assets/UsersList.js')])
    expect(manifest.map((e) => e.url)).toEqual(['assets/index.js'])
  })
})
