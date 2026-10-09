/**
 * One source of truth for how a match status looks *and reads*. MatchCard, BracketMatchCard,
 * RankedMatchHistory and MatchDetailView each carried their own status switch over their own
 * i18n namespace, so the same status was "Validé" in a list and "Finalisé" on the detail page.
 *
 * `ongoing` and `contested` are legacy aliases the cards have always accepted; they map onto
 * `pending_confirmation` and `disputed`.
 */
import { useI18n } from 'vue-i18n'

export type MatchStatusTone = 'win' | 'loss' | 'pending' | 'reported' | 'scheduled' | 'neutral'

/** Aliases resolved before anything else, so tone and label never disagree. */
const STATUS_ALIAS: Record<string, string> = {
  ongoing: 'pending_confirmation',
  contested: 'disputed',
}

function canonicalStatus(status?: string): string {
  if (!status) return ''
  return STATUS_ALIAS[status] ?? status
}

const STATUS_TONE: Record<string, MatchStatusTone> = {
  finalized: 'win',
  confirmed: 'win',
  disputed: 'loss',
  pending_confirmation: 'pending',
  reported: 'reported',
  scheduled: 'scheduled',
  cancelled: 'neutral',
}

const DOT_CLASS: Record<MatchStatusTone, string> = {
  win: 'bg-match-win/80',
  loss: 'bg-match-loss animate-pulse',
  pending: 'bg-yellow-400 animate-pulse',
  reported: 'bg-orange-400',
  scheduled: 'bg-blue-200',
  neutral: 'bg-slate-500',
}

const TEXT_CLASS: Record<MatchStatusTone, string> = {
  win: 'text-match-win/80',
  loss: 'text-match-loss',
  pending: 'text-yellow-400',
  reported: 'text-orange-400',
  scheduled: 'text-blue-200',
  neutral: 'text-muted',
}

/** Border + tint for a surface that carries the status, e.g. the scoreboard panel. */
const SURFACE_CLASS: Record<MatchStatusTone, string> = {
  win: 'border-match-win/20',
  loss: 'border-match-loss/30',
  pending: 'border-yellow-400/25',
  reported: 'border-orange-400/25',
  scheduled: 'border-blue-300/20',
  neutral: 'border-slate-700/40',
}

/** i18n keys of the shared status vocabulary, keyed by canonical status. */
const LABEL_KEY: Record<string, string> = {
  scheduled: 'matchStatus.scheduled',
  reported: 'matchStatus.reported',
  pending_confirmation: 'matchStatus.pendingConfirmation',
  confirmed: 'matchStatus.confirmed',
  disputed: 'matchStatus.disputed',
  finalized: 'matchStatus.finalized',
  cancelled: 'matchStatus.cancelled',
}

export function matchStatusTone(status?: string): MatchStatusTone {
  return STATUS_TONE[canonicalStatus(status)] ?? 'neutral'
}

export function matchStatusDotClass(status?: string): string {
  return DOT_CLASS[matchStatusTone(status)]
}

export function matchStatusTextClass(status?: string): string {
  return TEXT_CLASS[matchStatusTone(status)]
}

export function matchStatusSurfaceClass(status?: string): string {
  return SURFACE_CLASS[matchStatusTone(status)]
}

export function matchStatusLabelKey(status?: string): string | null {
  return LABEL_KEY[canonicalStatus(status)] ?? null
}

/**
 * Everything a component needs to render a match status. Labels need the composer, so they
 * live here rather than in the pure helpers above.
 */
export function useMatchStatus() {
  const { t } = useI18n()

  /** Falls back to the raw status: an unknown value is worth seeing, not swallowing. */
  function statusLabel(status?: string): string {
    const key = matchStatusLabelKey(status)
    return key ? t(key) : (status ?? '')
  }

  return {
    statusLabel,
    statusTone: matchStatusTone,
    statusDotClass: matchStatusDotClass,
    statusTextClass: matchStatusTextClass,
    statusSurfaceClass: matchStatusSurfaceClass,
  }
}
