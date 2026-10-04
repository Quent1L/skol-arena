import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SITE_URL } from '../site'

/**
 * L'origine du site est écrite à trois endroits qui ne peuvent pas s'importer entre eux
 * (config Astro, bundle frontend, scripts de release). Lecture texte plutôt qu'import :
 * charger `astro.config.mjs` tirerait toutes les intégrations Astro.
 */
const ROOT = join(import.meta.dir, '../..')

function readConstant(file: string, pattern: RegExp): string | undefined {
  return pattern.exec(readFileSync(join(ROOT, file), 'utf-8'))?.[1]
}

describe('SITE_URL', () => {
  it('est le site déclaré dans la config Astro', () => {
    expect(readConstant('docs/astro.config.mjs', /site:\s*['"]([^'"]+)['"]/)).toBe(SITE_URL)
  })

  it('est l’origine utilisée par le frontend', () => {
    expect(readConstant('frontend/src/config/links.ts', /SITE_URL\s*=\s*['"]([^'"]+)['"]/)).toBe(SITE_URL)
  })
})
