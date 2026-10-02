export function getInitials(name?: string | null): string {
  if (!name) return '?'
  const words = name.trim().split(/\s+/)
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

/**
 * Avatar backgrounds, kept to the cool half of the wheel plus magenta.
 *
 * The palette used to include amber, orange and red — the same hues the app
 * spends on meaning: amber marks an event in progress, red marks a loss. An
 * avatar landing on one of those read as a status chip sitting next to real
 * status chips. None of these carry that risk.
 *
 * Every entry clears 5:1 against the white initials drawn on it.
 */
const AVATAR_COLORS = [
  '#1d4ed8', // blue-700
  '#4338ca', // indigo-700
  '#6d28d9', // violet-700
  '#7e22ce', // purple-700
  '#a21caf', // fuchsia-700
  '#be185d', // pink-700
  '#0369a1', // sky-700
  '#0e7490', // cyan-700
  '#0f766e', // teal-700
  '#15803d', // green-700
]

export function getAvatarBg(name: string): string {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length
  return AVATAR_COLORS[idx]
}

/**
 * Folds case and diacritics so "eloise" finds "Éloïse". NFD splits an accented
 * letter into its base plus a combining mark, which the regex then drops.
 */
export function normalizeForSearch(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

export function matchesSearch(text: string | null | undefined, query: string): boolean {
  return normalizeForSearch(text ?? '').includes(normalizeForSearch(query))
}
