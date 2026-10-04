import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHANGELOG_DIR } from './apply-release-notes'
import { changelogUrl } from './site'

/**
 * Extrait de `CHANGELOG.md` le corps de la section d'une version, sans sa ligne de titre.
 * Chaîne vide quand la version n'y figure pas.
 */
export function extractChangelogSection(changelog: string, version: string): string {
  const lines = changelog.split(/\r?\n/)
  const heading = new RegExp(`^##? \\[?${version.replaceAll('.', '\\.')}\\]?[ (]`)
  const start = lines.findIndex((line) => heading.test(`${line} `))
  if (start === -1) return ''
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => /^##? \[?\d/.test(line))
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim()
}

/**
 * Corps de la release GitHub : le lien vers les notes fonctionnelles quand la version en a,
 * puis le changelog technique de la version.
 *
 * Appelé par `github.releaseNotes` de release-it, après que le plugin conventional-changelog
 * a écrit `CHANGELOG.md` (les plugins externes passent avant GitHub au `beforeRelease`).
 */
export function githubReleaseNotes(version: string, cwd = process.cwd()): string {
  const changelogPath = join(cwd, 'CHANGELOG.md')
  const technical = existsSync(changelogPath) ? extractChangelogSection(readFileSync(changelogPath, 'utf-8'), version) : ''
  const hasNotes = existsSync(join(cwd, CHANGELOG_DIR, `${version}.md`))
  const link = hasNotes ? `**✨ What's new for players and admins:** ${changelogUrl(version)}` : ''
  return [link, technical].filter(Boolean).join('\n\n')
}

if (import.meta.main) {
  const version = process.argv[2]
  if (!version) {
    console.error('github-release-notes: version manquante en argument')
    process.exit(1)
  }
  console.log(githubReleaseNotes(version))
}
