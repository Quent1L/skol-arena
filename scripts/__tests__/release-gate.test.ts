import { describe, expect, it } from 'bun:test'
import type { Commit } from '../release-gate'
import {
  hasReleasableType,
  isReleasableCommit,
  parseSubject,
  shouldRelease,
  touchesSoftware,
} from '../release-gate'

function commit(subject: string, files: string[], body = ''): Commit {
  return { subject, body, files }
}

const TAGGED = { hasTag: true, hasForceMarker: false }

describe('parseSubject', () => {
  it('décompose type, scope et marqueur breaking', () => {
    expect(parseSubject('perf(notifications)!: paginate the feed')).toEqual({
      type: 'perf',
      scope: 'notifications',
      breaking: true,
    })
    expect(parseSubject('feat: add double elimination')).toEqual({
      type: 'feat',
      scope: '',
      breaking: false,
    })
  })

  it('rejette un sujet non conventionnel', () => {
    expect(parseSubject('Merge branch main')).toBeNull()
    expect(parseSubject('WIP stuff')).toBeNull()
  })
})

describe('touchesSoftware', () => {
  it('reconnaît les dossiers applicatifs', () => {
    expect(touchesSoftware(['backend/src/index.ts'])).toBe(true)
    expect(touchesSoftware(['frontend/src/App.vue'])).toBe(true)
    expect(touchesSoftware(['shared/src/types/index.ts'])).toBe(true)
  })

  it('publie sur le packaging et le package.json racine (catalog)', () => {
    expect(touchesSoftware(['Dockerfile'])).toBe(true)
    expect(touchesSoftware(['package.json', 'bun.lock'])).toBe(true)
  })

  // Le lockfile est unique au workspace Bun : il bouge pour docs/ comme pour backend/.
  it('ignore le lockfile seul', () => {
    expect(touchesSoftware(['bun.lock', 'docs/package.json'])).toBe(false)
  })

  it('ignore la denylist', () => {
    expect(touchesSoftware(['docs/src/pages/index.astro'])).toBe(false)
    expect(touchesSoftware(['.github/workflows/release.yml'])).toBe(false)
    expect(touchesSoftware(['load-test/scenario.js'])).toBe(false)
    expect(touchesSoftware(['scripts/release-gate.ts'])).toBe(false)
    expect(touchesSoftware(['.husky/pre-commit'])).toBe(false)
    expect(touchesSoftware(['README.md', 'CLAUDE.md'])).toBe(false)
    expect(touchesSoftware([])).toBe(false)
  })

  // Une note fonctionnelle seule ne publie pas : elle partira avec la prochaine release.
  it('ignore les notes fonctionnelles et NOTES_VERSION', () => {
    expect(touchesSoftware(['docs/release-notes/unreleased/photo-viewer.md'])).toBe(false)
    expect(touchesSoftware(['docs/src/content/changelog/2.1.0.md', 'NOTES_VERSION'])).toBe(false)
  })

  // `docs/` ne doit pas neutraliser un vrai changement présent dans le même commit.
  it('publie dès qu’un seul fichier échappe à la denylist', () => {
    expect(touchesSoftware(['docs/index.md', 'backend/src/index.ts'])).toBe(true)
  })
})

describe('hasReleasableType', () => {
  it('accepte les types applicatifs', () => {
    for (const type of ['feat', 'fix', 'perf', 'refactor', 'chore', 'style', 'revert']) {
      expect(hasReleasableType(`${type}(x): sujet`)).toBe(true)
    }
  })

  it('refuse docs, test et ci', () => {
    for (const type of ['docs', 'test', 'ci']) {
      expect(hasReleasableType(`${type}(x): sujet`)).toBe(false)
    }
  })

  it('accepte un breaking change quel que soit son type', () => {
    expect(hasReleasableType('docs(api)!: drop the v1 guide')).toBe(true)
    expect(hasReleasableType('test(api): rework', 'BREAKING CHANGE: fixtures moved')).toBe(true)
  })

  // Sans cette exception, le package.json racine bumpé par release-it rendrait chaque
  // release publiable et le gate boucherait.
  it('écarte les commits chore(release)', () => {
    expect(hasReleasableType('chore(release): v2.0.1')).toBe(false)
  })

  it('refuse un sujet non conventionnel', () => {
    expect(hasReleasableType('Merge pull request #12')).toBe(false)
  })
})

describe('isReleasableCommit', () => {
  it('exige type ET chemin sur le même commit', () => {
    expect(isReleasableCommit(commit('fix(docs): broken link', ['docs/index.md']))).toBe(false)
    expect(isReleasableCommit(commit('docs(backend): add JSDoc', ['backend/src/index.ts']))).toBe(
      false,
    )
    expect(
      isReleasableCommit(commit('fix(match): keep one root node', ['frontend/src/App.vue'])),
    ).toBe(true)
  })
})

describe('shouldRelease', () => {
  it('publie sans tag existant', () => {
    expect(shouldRelease([], { hasTag: false, hasForceMarker: false }).proceed).toBe(true)
  })

  it('publie quand le marqueur FORCE_UPDATE est posé, même sur du docs-only', () => {
    const commits = [commit('docs(site): tweak', ['docs/index.md'])]
    expect(shouldRelease(commits, { hasTag: true, hasForceMarker: true }).proceed).toBe(true)
  })

  it('ne publie pas sur une plage docs / ci / load-test', () => {
    const commits = [
      commit('docs(site): add SEO metadata', ['bun.lock', 'CLAUDE.md', 'docs/src/lib/seo.ts']),
      commit('ci(docs): add Vercel Web Analytics', ['bun.lock', 'docs/package.json']),
      commit('chore(hooks): skip the app suite on docs-only commits', ['.husky/pre-commit']),
      commit('refactor(load): tune the scenario', ['load-test/scenario.js']),
    ]
    expect(shouldRelease(commits, TAGGED).proceed).toBe(false)
  })

  // Cas réel b6a0bd3 : type chore publiable, mais seuls docs/ et le lockfile bougent.
  it('ne publie pas un bump de dépendance propre à docs/', () => {
    const commits = [
      commit('chore(deps): bump docs astro to 7.2.9, sharp to 0.35', [
        'bun.lock',
        'docs/package.json',
      ]),
    ]
    expect(shouldRelease(commits, TAGGED).proceed).toBe(false)
  })

  it('publie un bump de dépendance applicative', () => {
    const commits = [commit('chore(deps): bump zod', ['backend/package.json', 'bun.lock'])]
    expect(shouldRelease(commits, TAGGED).proceed).toBe(true)
  })

  it('publie un bump de catalog, qui ne touche que la racine', () => {
    const commits = [
      commit('chore(deps): bump the zod catalog entry', ['bun.lock', 'package.json']),
    ]
    expect(shouldRelease(commits, TAGGED).proceed).toBe(true)
  })

  it('publie un breaking change applicatif', () => {
    const commits = [
      commit('perf(notifications)!: paginate the feed', ['backend/src/x.ts', 'shared/src/y.ts']),
    ]
    expect(shouldRelease(commits, TAGGED).proceed).toBe(true)
  })

  // Le croisement est par commit : un type publiable et un chemin publiable venus de deux
  // commits distincts ne s'additionnent pas.
  it('ne combine pas le type d’un commit avec le chemin d’un autre', () => {
    const commits = [
      commit('feat(docs): add a blog', ['docs/src/content/blog/a.md']),
      commit('ci(backend): pin the runner image', ['backend/Dockerfile.ci']),
    ]
    expect(shouldRelease(commits, TAGGED).proceed).toBe(false)
  })

  it('ignore un chore(release) isolé', () => {
    const commits = [commit('chore(release): v2.0.1', ['CHANGELOG.md', 'VERSION', 'package.json'])]
    expect(shouldRelease(commits, TAGGED).proceed).toBe(false)
  })

  it('ignore un commit vide', () => {
    expect(shouldRelease([commit('feat(x): rien', [])], TAGGED).proceed).toBe(false)
  })

  it('remonte les sujets publiables pour le log CI', () => {
    const commits = [
      commit('docs(site): tweak', ['docs/index.md']),
      commit('feat(tournament): add double elimination', ['backend/src/x.ts']),
    ]
    expect(shouldRelease(commits, TAGGED).commits).toEqual([
      'feat(tournament): add double elimination',
    ])
  })
})
