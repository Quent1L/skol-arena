import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  applyReleaseNotes,
  audienceLabel,
  CHANGELOG_DIR,
  NOTES_VERSION_FILE,
  parseNote,
  rebaseLinks,
  renderRelease,
  UNRELEASED_DIR,
} from '../apply-release-notes'

const TODAY = new Date('2026-10-04T12:00:00Z')

function note(type: string, title: string, body = 'Body.'): string {
  return `---\ntype: ${type}\ntitle: ${title}\n---\n${body}\n`
}

describe('parseNote', () => {
  it('lit le type, le titre et le corps', () => {
    expect(parseNote('a.md', note('new', 'Photo viewer', 'Tap it.'))).toEqual({
      file: 'a.md',
      type: 'new',
      title: 'Photo viewer',
      body: 'Tap it.',
      audience: [],
    })
  })

  it('lit une audience, seule ou en liste', () => {
    const source = '---\ntype: new\ntitle: X\naudience: tournament-admins, super-admins\n---\nBody'
    expect(parseNote('a.md', source).audience).toEqual(['tournament-admins', 'super-admins'])
  })

  it('rejette une audience inconnue', () => {
    expect(() => parseNote('bad.md', '---\ntype: new\ntitle: X\naudience: kiosk\n---\n')).toThrow('kiosk')
  })

  it('retire les guillemets autour d’une valeur', () => {
    expect(parseNote('a.md', note('fixed', '"Scores: no more typos"')).title).toBe('Scores: no more typos')
  })

  it('rejette un type inconnu en nommant le fichier', () => {
    expect(() => parseNote('bad.md', note('feature', 'X'))).toThrow('bad.md')
  })

  it('rejette un titre absent', () => {
    expect(() => parseNote('bad.md', '---\ntype: new\n---\nBody')).toThrow('title')
  })

  it('rejette un fichier sans frontmatter', () => {
    expect(() => parseNote('bad.md', 'Just text')).toThrow('frontmatter')
  })
})

describe('rebaseLinks', () => {
  const from = '/repo/docs/release-notes/unreleased'
  const to = '/repo/docs/src/content/changelog'

  it('réécrit une image relative pour qu’elle désigne le même fichier', () => {
    const body = '![Viewer](../../src/assets/changelog/viewer.png "Full screen")'
    const rebased = rebaseLinks(body, from, to)

    expect(rebased).toBe('![Viewer](../../assets/changelog/viewer.png "Full screen")')
    const target = /\(([^)\s]+)/.exec(rebased)?.[1] ?? ''
    expect(resolve(to, target)).toBe('/repo/docs/src/assets/changelog/viewer.png')
  })

  it('réécrit aussi le src d’une balise img', () => {
    expect(rebaseLinks('<img src="../../src/assets/changelog/a.png" alt="">', from, to)).toBe(
      '<img src="../../assets/changelog/a.png" alt="">',
    )
  })

  it('laisse intactes les URL absolues, racine et ancres', () => {
    const body = '![a](https://example.com/a.png) [docs](/docs/install) [top](#top)'
    expect(rebaseLinks(body, from, to)).toBe(body)
  })
})

describe('renderRelease', () => {
  it('met les notes sans corps en puces après les notes détaillées', () => {
    const output = renderRelease('2.1.0', '2026-10-04', [
      { file: 'a.md', type: 'fixed', title: 'Short one', body: '', audience: [] },
      { file: 'b.md', type: 'fixed', title: 'Long one', body: 'Details.', audience: [] },
    ])

    expect(output).toEndWith('### 🐛 Fixed\n\n#### Long one\n\nDetails.\n\n- Short one\n')
  })

  it('ordonne les sections New, Improved, Fixed et omet les vides', () => {
    const output = renderRelease('2.1.0', '2026-10-04', [
      { file: 'b.md', type: 'fixed', title: 'Fix', body: 'F.', audience: [] },
      { file: 'a.md', type: 'new', title: 'Feature', body: 'N.', audience: [] },
    ])

    expect(output).toBe(
      '---\nversion: 2.1.0\ndate: 2026-10-04\n---\n\n### ✨ New\n\n#### Feature\n\nN.\n\n### 🐛 Fixed\n\n#### Fix\n\nF.\n',
    )
  })
})

describe('audienceLabel', () => {
  it('nomme une ou plusieurs audiences', () => {
    expect(audienceLabel([])).toBe('')
    expect(audienceLabel(['super-admins'])).toBe('**For super admins** · ')
    expect(audienceLabel(['players', 'tournament-admins', 'self-hosters'])).toBe(
      '**For players, tournament admins and self-hosters** · ',
    )
  })

  it('préfixe le texte d’une note détaillée comme d’une puce', () => {
    const output = renderRelease('2.1.0', '2026-10-04', [
      { file: 'a.md', type: 'new', title: 'Seasons', body: 'They end alone.', audience: ['super-admins'] },
      { file: 'b.md', type: 'new', title: 'Short one', body: '', audience: ['tournament-admins'] },
    ])
    expect(output).toContain('#### Seasons\n\n**For super admins** · They end alone.')
    expect(output).toContain('- **For tournament admins** · Short one')
  })
})

describe('applyReleaseNotes', () => {
  let cwd: string
  let fromDir: string

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'release-notes-'))
    fromDir = join(cwd, UNRELEASED_DIR)
    mkdirSync(fromDir, { recursive: true })
    writeFileSync(join(fromDir, 'README.md'), '# How to write a note\n')
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  // `stage: false` partout : le dossier temporaire n'est pas un dépôt git.
  it('ne fait rien quand aucune note n’attend', () => {
    expect(applyReleaseNotes('2.1.0', cwd, false, TODAY)).toBe(false)
    expect(existsSync(join(cwd, NOTES_VERSION_FILE))).toBe(false)
    expect(existsSync(join(fromDir, 'README.md'))).toBe(true)
  })

  it('consolide les notes, écrit NOTES_VERSION et consomme les fragments', () => {
    writeFileSync(join(fromDir, 'b-fix.md'), note('fixed', 'Scores save again'))
    writeFileSync(join(fromDir, 'a-new.md'), note('new', 'Photo viewer'))
    writeFileSync(join(fromDir, '_draft.md'), note('new', 'Not yet'))

    expect(applyReleaseNotes('2.1.0', cwd, false, TODAY)).toBe(true)

    const output = readFileSync(join(cwd, CHANGELOG_DIR, '2.1.0.md'), 'utf-8')
    expect(output).toStartWith('---\nversion: 2.1.0\ndate: 2026-10-04\n---\n')
    expect(output.indexOf('#### Photo viewer')).toBeLessThan(output.indexOf('#### Scores save again'))
    expect(output).not.toContain('Not yet')
    expect(readFileSync(join(cwd, NOTES_VERSION_FILE), 'utf-8')).toBe('2.1.0\n')
    expect(existsSync(join(fromDir, 'a-new.md'))).toBe(false)
    expect(existsSync(join(fromDir, '_draft.md'))).toBe(true)
    expect(existsSync(join(fromDir, 'README.md'))).toBe(true)
  })

  it('garde les images valides après déplacement', () => {
    mkdirSync(join(cwd, 'docs/src/assets/changelog'), { recursive: true })
    writeFileSync(join(cwd, 'docs/src/assets/changelog/viewer.png'), '')
    writeFileSync(join(fromDir, 'a.md'), note('new', 'Viewer', '![Viewer](../../src/assets/changelog/viewer.png)'))

    applyReleaseNotes('2.1.0', cwd, false, TODAY)

    const output = readFileSync(join(cwd, CHANGELOG_DIR, '2.1.0.md'), 'utf-8')
    const target = /!\[Viewer\]\(([^)]+)\)/.exec(output)?.[1] ?? ''
    expect(existsSync(resolve(cwd, CHANGELOG_DIR, target))).toBe(true)
  })

  it('refuse de publier une image manquante et ne touche à rien', () => {
    writeFileSync(join(fromDir, 'a.md'), note('new', 'Viewer', '![Viewer](../../src/assets/changelog/missing.png)'))

    expect(() => applyReleaseNotes('2.1.0', cwd, false, TODAY)).toThrow('missing.png')
    expect(existsSync(join(fromDir, 'a.md'))).toBe(true)
    expect(existsSync(join(cwd, NOTES_VERSION_FILE))).toBe(false)
  })
})
