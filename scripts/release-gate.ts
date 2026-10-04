import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { MARKER_FILE } from './apply-force-update'

/**
 * Types de commit qui décrivent un changement du logiciel livré.
 *
 * `docs`, `test` et `ci` en sont absents : ils ne changent rien à ce que l'image Docker
 * publie. `chore` y figure parce qu'un `chore(deps)` bumpe de vraies dépendances — le
 * filtre de chemin ci-dessous se charge d'écarter `chore(hooks)`, `chore(ci)` et consorts.
 */
export const RELEASABLE_TYPES = ['feat', 'fix', 'perf', 'refactor', 'chore', 'style', 'revert']

/**
 * Denylist des chemins qui ne constituent pas le logiciel. Tout le reste — `backend/`,
 * `frontend/`, `shared/`, `Dockerfile*`, le `package.json` racine, `tsconfig.json` — publie.
 *
 * Denylist et non allowlist, comme `.husky/pre-commit` : un chemin inconnu (nouveau
 * workspace, nouveau fichier de packaging) doit publier par défaut plutôt que d'être
 * silencieusement oublié.
 */
export const NON_RELEASE_PATHS = [
  'docs/',
  'load-test/',
  'scripts/',
  '.github/',
  '.husky/',
  '.claude/',
  '.vscode/',
  'README.md',
  'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md',
  'SECURITY.md',
  'LICENSE',
  'CHANGELOG.md',
  'CLAUDE.md',
  'VERSION',
  'MIN_VERSION',
  'NOTES_VERSION',
  // Lockfile unique du workspace Bun : il bouge pour une dépendance de n'importe quel
  // workspace, docs/ compris, donc il ne discrimine rien. Il n'est jamais non plus le seul
  // signal utile — un ajout de dépendance applicative touche aussi le package.json de son
  // workspace, qui est, lui, releasable. Le package.json racine reste hors liste : il porte
  // le `catalog` (zod, better-auth, typescript), donc des dépendances réellement livrées.
  'bun.lock',
  '.gitignore',
  '.mcp.json',
  '.opencode.json',
  '.prettierrc.json',
  '.release-it.json',
  'commitlint.config.js',
]

export interface Commit {
  subject: string
  body: string
  files: string[]
}

export interface GateDecision {
  proceed: boolean
  reason: string
  commits: string[]
}

const CONVENTIONAL = /^(?<type>[a-z]+)(?:\((?<scope>[^)]*)\))?(?<breaking>!)?: /
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE:/m

/** Décompose un sujet conventionnel. `null` quand le sujet n'en est pas un. */
export function parseSubject(
  subject: string,
): { type: string; scope: string; breaking: boolean } | null {
  const groups = CONVENTIONAL.exec(subject)?.groups
  if (!groups) return null
  return { type: groups.type, scope: groups.scope ?? '', breaking: groups.breaking === '!' }
}

/** Vrai dès qu'un fichier échappe à la denylist. */
export function touchesSoftware(files: string[]): boolean {
  return files.some((file) =>
    NON_RELEASE_PATHS.every((path) =>
      path.endsWith('/') ? !file.startsWith(path) : file !== path,
    ),
  )
}

/**
 * Filtre de type seul. Un changement breaking passe quel que soit son type ; les commits
 * `chore(release)` sont écartés d'abord, sans quoi le `package.json` racine qu'ils
 * modifient les rendrait publiables et chaque release en déclencherait une autre.
 */
export function hasReleasableType(subject: string, body = ''): boolean {
  const parsed = parseSubject(subject)
  if (!parsed) return false
  if (parsed.type === 'chore' && parsed.scope === 'release') return false
  if (parsed.breaking || BREAKING_FOOTER.test(body)) return true
  return RELEASABLE_TYPES.includes(parsed.type)
}

/** Croisement par commit : le type et les chemins doivent concorder sur le même commit. */
export function isReleasableCommit(commit: Commit): boolean {
  return hasReleasableType(commit.subject, commit.body) && touchesSoftware(commit.files)
}

export function shouldRelease(
  commits: Commit[],
  options: { hasTag: boolean; hasForceMarker: boolean },
): GateDecision {
  // Le marqueur est consommé par le hook `after:bump` : sans release, MIN_VERSION ne serait
  // jamais écrit et le marqueur resterait en travers du dépôt.
  if (options.hasForceMarker) {
    return { proceed: true, reason: `marqueur ${MARKER_FILE} posé`, commits: [] }
  }
  if (!options.hasTag) return { proceed: true, reason: 'aucun tag existant', commits: [] }

  const releasable = commits.filter(isReleasableCommit).map((commit) => commit.subject)
  if (releasable.length > 0) {
    return {
      proceed: true,
      reason: `${releasable.length} commit(s) publiable(s)`,
      commits: releasable,
    }
  }
  return { proceed: false, reason: `aucun commit publiable sur ${commits.length}`, commits: [] }
}

const FIELD = '\x1f'
const RECORD = '\x1e'

function git(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf-8' })
}

export function lastTag(): string | null {
  try {
    return git(['describe', '--tags', '--abbrev=0']).trim() || null
  } catch {
    return null
  }
}

/**
 * Commits depuis `tag`. Les fichiers ne sont lus que pour les commits qui passent déjà le
 * filtre de type : un `git show` par candidat, pas un par commit de la plage.
 */
export function commitsSince(tag: string): Commit[] {
  const raw = git([
    'log',
    '--no-merges',
    `--format=%H${FIELD}%s${FIELD}%b${RECORD}`,
    `${tag}..HEAD`,
  ])
  return raw
    .split(RECORD)
    .map((record) => record.replace(/^\n/, ''))
    .filter((record) => record.length > 0)
    .map((record) => {
      const [sha, subject, body = ''] = record.split(FIELD)
      const files = hasReleasableType(subject, body)
        ? git(['show', '--no-commit-id', '--name-only', '--format=', sha])
            .split('\n')
            .filter(Boolean)
        : []
      return { subject, body, files }
    })
}

if (import.meta.main) {
  const argv = process.argv.slice(2)
  const tag = lastTag()
  const decision = shouldRelease(tag ? commitsSince(tag) : [], {
    hasTag: tag !== null,
    hasForceMarker: existsSync(join(process.cwd(), MARKER_FILE)),
  })

  const since = tag ? ` depuis ${tag}` : ''
  console.log(
    `${decision.proceed ? '🚀 Release :' : '⏭️  Pas de release :'} ${decision.reason}${since}`,
  )
  for (const subject of decision.commits) console.log(`   • ${subject}`)

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `proceed=${decision.proceed}\n`)
  }

  const runIndex = argv.indexOf('--run')
  if (runIndex !== -1 && decision.proceed) {
    const { status } = spawnSync('bunx', ['release-it', ...argv.slice(runIndex + 1)], {
      stdio: 'inherit',
    })
    process.exit(status ?? 1)
  }
}
