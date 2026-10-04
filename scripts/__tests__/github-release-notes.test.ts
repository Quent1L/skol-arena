import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CHANGELOG_DIR } from '../apply-release-notes'
import { extractChangelogSection, githubReleaseNotes } from '../github-release-notes'

const CHANGELOG = `# Changelog

## [2.1.0](https://github.com/x/y/compare/2.0.10...2.1.0) (2026-10-04)

### ✨ New Features

* **avatar:** open player photo full screen ([abc](https://github.com/x/y/commit/abc))

## [2.0.10](https://github.com/x/y/compare/2.0.0...2.0.10) (2026-09-20)

### 🐛 Bug Fixes

* **scores:** save again

# [2.0.0](https://github.com/x/y/compare/1.20.2...2.0.0) (2026-08-30)

### ✨ New Features

* breaking thing
`

describe('extractChangelogSection', () => {
  it('extrait la première section sans sa ligne de titre', () => {
    expect(extractChangelogSection(CHANGELOG, '2.1.0')).toBe(
      '### ✨ New Features\n\n* **avatar:** open player photo full screen ([abc](https://github.com/x/y/commit/abc))',
    )
  })

  it('s’arrête à la section suivante, même de niveau 1', () => {
    expect(extractChangelogSection(CHANGELOG, '2.0.10')).toBe('### 🐛 Bug Fixes\n\n* **scores:** save again')
  })

  it('extrait la dernière section jusqu’à la fin du fichier', () => {
    expect(extractChangelogSection(CHANGELOG, '2.0.0')).toBe('### ✨ New Features\n\n* breaking thing')
  })

  it('ne confond pas une version avec un préfixe d’une autre', () => {
    expect(extractChangelogSection(CHANGELOG, '2.0.1')).toBe('')
  })
})

describe('githubReleaseNotes', () => {
  let cwd: string

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'gh-notes-'))
    writeFileSync(join(cwd, 'CHANGELOG.md'), CHANGELOG)
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  it('préfixe le lien vers les notes fonctionnelles quand la version en a', () => {
    mkdirSync(join(cwd, CHANGELOG_DIR), { recursive: true })
    writeFileSync(join(cwd, CHANGELOG_DIR, '2.1.0.md'), '')

    const notes = githubReleaseNotes('2.1.0', cwd)
    expect(notes).toStartWith("**✨ What's new for players and admins:** https://skol-arena.com/changelog#v2.1.0\n\n")
    expect(notes).toContain('open player photo full screen')
  })

  it('ne met que le changelog technique sans notes fonctionnelles', () => {
    expect(githubReleaseNotes('2.0.10', cwd)).toBe('### 🐛 Bug Fixes\n\n* **scores:** save again')
  })

  it('renvoie une chaîne vide sans crash quand rien ne correspond', () => {
    rmSync(join(cwd, 'CHANGELOG.md'))
    expect(githubReleaseNotes('9.9.9', cwd)).toBe('')
  })
})
