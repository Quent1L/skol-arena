import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

/** Notes fonctionnelles en attente : un fichier par changement, écrit dans la PR. */
export const UNRELEASED_DIR = 'docs/release-notes/unreleased'
/** Collection Astro `changelog` : une entrée par version publiée. */
export const CHANGELOG_DIR = 'docs/src/content/changelog'
/** Dernière version ayant des notes, lue par le build frontend. Écrit ici, jamais à la main. */
export const NOTES_VERSION_FILE = 'NOTES_VERSION'

// Mêmes emoji que les sections du changelog technique (`.release-it.json`) : ✨ feat,
// ⚡ perf, 🐛 fix — « amélioré » est ce qui se rapproche le plus d'une perf ressentie.
export const NOTE_SECTIONS = [
  { type: 'new', heading: '✨ New' },
  { type: 'improved', heading: '⚡ Improved' },
  { type: 'fixed', heading: '🐛 Fixed' },
] as const

export type NoteType = (typeof NOTE_SECTIONS)[number]['type']

/**
 * Who a note concerns, when it is not everyone — named like the roles in the app: tournament
 * admins run competitions, super admins manage the whole instance, self-hosters run the
 * server. A note without audience is for everyone.
 */
export const AUDIENCES = ['players', 'tournament-admins', 'super-admins', 'self-hosters'] as const

export type Audience = (typeof AUDIENCES)[number]

const AUDIENCE_NAMES: Record<Audience, string> = {
  players: 'players',
  'tournament-admins': 'tournament admins',
  'super-admins': 'super admins',
  'self-hosters': 'self-hosters',
}

export interface Note {
  file: string
  type: NoteType
  title: string
  body: string
  audience: Audience[]
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/
// `![alt](cible "titre")`, `[texte](cible)` et `<img src="cible">` : seule la cible bouge.
const MD_LINK = /(!?\[[^\]]*\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g
const HTML_IMG = /(<img\b[^>]*?\bsrc=["'])([^"']+)(["'])/g
const MD_IMAGE_TARGET = /!\[[^\]]*\]\(([^)\s]+)/g
const HTML_IMG_TARGET = /<img\b[^>]*?\bsrc=["']([^"']+)["']/g

function readFrontmatter(raw: string): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const match = /^([A-Za-z]+):\s*(.*)$/.exec(line)
    if (match) fields[match[1]] = match[2].trim().replace(/^(["'])(.*)\1$/, '$2')
  }
  return fields
}

function isNoteType(value: string | undefined): value is NoteType {
  return NOTE_SECTIONS.some((section) => section.type === value)
}

function parseAudience(file: string, raw: string | undefined): Audience[] {
  const values = (raw ?? '').split(',').map((value) => value.trim()).filter(Boolean)
  const unknown = values.find((value) => !(AUDIENCES as readonly string[]).includes(value))
  if (unknown) throw new Error(`${file}: audience inconnue "${unknown}" (attendu : ${AUDIENCES.join(', ')})`)
  return values as Audience[]
}

/** Parse un fragment. Lève une erreur nommant le fichier plutôt que de publier une note cassée. */
export function parseNote(file: string, source: string): Note {
  const match = FRONTMATTER.exec(source)
  if (!match) throw new Error(`${file}: frontmatter manquant`)
  const { type, title, audience } = readFrontmatter(match[1])
  if (!isNoteType(type)) {
    throw new Error(`${file}: type invalide "${type ?? ''}" (attendu : new, improved ou fixed)`)
  }
  if (!title) throw new Error(`${file}: title manquant`)
  return { file, type, title, body: match[2].trim(), audience: parseAudience(file, audience) }
}

function isRelative(target: string): boolean {
  return !/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(target)
}

function rebase(target: string, fromDir: string, toDir: string): string {
  if (!isRelative(target)) return target
  return relative(toDir, resolve(fromDir, target)).split('\\').join('/')
}

/**
 * Réécrit les cibles relatives d'un corps Markdown déplacé de `fromDir` vers `toDir`, pour
 * qu'elles désignent toujours le même fichier. Les URL absolues et les ancres sont intactes.
 */
export function rebaseLinks(body: string, fromDir: string, toDir: string): string {
  return body
    .replace(MD_LINK, (_, open: string, target: string, close: string) => open + rebase(target, fromDir, toDir) + close)
    .replace(HTML_IMG, (_, open: string, target: string, close: string) => open + rebase(target, fromDir, toDir) + close)
}

/** Lève une erreur si une image relative du corps ne pointe sur aucun fichier. */
export function assertImagesExist(note: Note, fromDir: string): void {
  const targets = [...note.body.matchAll(MD_IMAGE_TARGET), ...note.body.matchAll(HTML_IMG_TARGET)].map((m) => m[1])
  for (const target of targets.filter(isRelative)) {
    const path = resolve(fromDir, target.split(/[?#]/)[0])
    if (!existsSync(path)) throw new Error(`${note.file}: image introuvable ${target}`)
  }
}

/**
 * Corps d'une section : une note avec un corps prend un titre `####`, une note réduite à
 * son titre devient une puce de la liste finale — un titre sans rien dessous se lit mal.
 */
/** `**For tournament admins and super admins** · ` devant le texte, rien pour une note qui concerne tout le monde. */
export function audienceLabel(audience: Audience[]): string {
  if (audience.length === 0) return ''
  const words = audience.map((value) => AUDIENCE_NAMES[value])
  const names = words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : words[0]
  return `**For ${names}** · `
}

function renderSection(heading: string, entries: Note[]): string {
  const detailed = entries
    .filter((note) => note.body)
    .map((note) => `#### ${note.title}\n\n${audienceLabel(note.audience)}${note.body}`)
  const brief = entries.filter((note) => !note.body).map((note) => `- ${audienceLabel(note.audience)}${note.title}`)
  const blocks = brief.length > 0 ? [...detailed, brief.join('\n')] : detailed
  return `### ${heading}\n\n${blocks.join('\n\n')}`
}

/**
 * Assemble l'entrée de collection d'une version : sections dans un ordre fixe, vides omises.
 * Titres à partir de `###` : la page `/changelog` donne déjà un `h2` à chaque version.
 */
export function renderRelease(version: string, date: string, notes: Note[]): string {
  const sections = NOTE_SECTIONS.map(({ type, heading }) => {
    const entries = notes.filter((note) => note.type === type)
    return entries.length > 0 ? renderSection(heading, entries) : null
  }).filter((section): section is string => section !== null)
  return `---\nversion: ${version}\ndate: ${date}\n---\n\n${sections.join('\n\n')}\n`
}

function listFragments(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md') && name !== 'README.md' && !name.startsWith('_'))
    .sort()
}

/**
 * Consolide les notes en attente dans l'entrée de la version publiée, depuis le hook
 * `after:bump` — comme `apply-force-update.ts`, c'est le premier moment où la version est
 * connue, et encore avant le commit `chore(release)`.
 *
 * Retourne true quand au moins une note a été publiée.
 */
export function applyReleaseNotes(version: string, cwd = process.cwd(), stage = true, today = new Date()): boolean {
  const fromDir = join(cwd, UNRELEASED_DIR)
  const files = listFragments(fromDir)
  if (files.length === 0) return false

  const toDir = join(cwd, CHANGELOG_DIR)
  const notes = files.map((file) => parseNote(file, readFileSync(join(fromDir, file), 'utf-8')))
  for (const note of notes) assertImagesExist(note, fromDir)
  const rebased = notes.map((note) => ({ ...note, body: rebaseLinks(note.body, fromDir, toDir) }))

  const target = join(toDir, `${version}.md`)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, renderRelease(version, today.toISOString().slice(0, 10), rebased))
  writeFileSync(join(cwd, NOTES_VERSION_FILE), `${version}\n`)
  for (const file of files) rmSync(join(fromDir, file))
  // `-A` sur le dossier enregistre aussi la suppression des fragments trackés.
  if (stage) execFileSync('git', ['add', '-A', '--', UNRELEASED_DIR, target, NOTES_VERSION_FILE], { cwd })
  return true
}

if (import.meta.main) {
  const version = process.argv[2]
  if (!version) {
    console.error('apply-release-notes: version manquante en argument')
    process.exit(1)
  }
  if (applyReleaseNotes(version)) {
    console.log(`📰 Notes fonctionnelles publiées : ${CHANGELOG_DIR}/${version}.md`)
  }
}
