import type { ClientBaseTournament } from '@skol-arena/shared'
import {
  resolveChampionshipConfig,
  resolveScoringConfig,
  resolveVoteConfig,
} from '@skol-arena/shared'

/** One line of the "Format & rules" tab: an icon, a heading and a plain sentence. */
export interface SettingsRow {
  id: string
  icon: string
  title: string
  text: string
}

type Translate = (key: string, params?: Record<string, unknown>) => string
type Tournament = Pick<
  ClientBaseTournament,
  | 'mode'
  | 'teamMode'
  | 'minTeamSize'
  | 'maxTeamSize'
  | 'allowDraw'
  | 'scoreEnabled'
  | 'minScore'
  | 'maxScore'
  | 'validationMode'
  | 'validationTimerHours'
  | 'scoringConfig'
  | 'championshipConfig'
  | 'voteConfig'
>

const K = 'tournamentSettingsTab'

function formatRow(tn: Tournament, t: Translate): SettingsRow {
  const { minTeamSize: min, maxTeamSize: max } = tn
  const exact = min === max
  let text: string
  if (tn.teamMode === 'static') {
    text = exact
      ? t(`${K}.format.staticExact`, { size: min })
      : t(`${K}.format.staticRange`, { min, max })
  } else if (exact && min === 1) {
    text = t(`${K}.format.solo`)
  } else {
    const format = exact
      ? t('matchFormat.exact', { size: min })
      : t('matchFormat.range', { min, max })
    text = t(exact ? `${K}.format.flexExact` : `${K}.format.flexRange`, { format })
  }
  return { id: 'format', icon: 'fa-users', title: t(`${K}.format.title`), text }
}

function resultRow(tn: Tournament, t: Translate): SettingsRow {
  const parts = [t(tn.allowDraw ? `${K}.result.drawAllowed` : `${K}.result.noDraw`)]
  if (!tn.scoreEnabled) parts.push(t(`${K}.result.winnerOnly`))
  else if (tn.minScore != null && tn.maxScore != null)
    parts.push(t(`${K}.result.scoreRange`, { min: tn.minScore, max: tn.maxScore }))
  else parts.push(t(`${K}.result.score`))
  if (tn.mode === 'championship') {
    const s = resolveScoringConfig(tn.scoringConfig)
    const key = tn.allowDraw ? `${K}.result.points` : `${K}.result.pointsNoDraw`
    parts.push(t(key, { win: s.pointPerVictory, draw: s.pointPerDraw, loss: s.pointPerLoss }))
  }
  return {
    id: 'result',
    icon: 'fa-scale-balanced',
    title: t(`${K}.result.title`),
    text: parts.join(' '),
  }
}

function limitsRow(tn: Tournament, t: Translate): SettingsRow | null {
  if (tn.mode !== 'championship') return null
  const c = resolveChampionshipConfig(tn.championshipConfig)
  const parts = [
    t(`${K}.limits.matches`, { max: c.maxMatchesPerPlayer }),
    t(`${K}.limits.opponent`, { max: c.maxTimesWithSameOpponent }),
  ]
  // A fixed team always plays with the same teammates, and 1v1 has none.
  if (tn.teamMode === 'flex' && tn.maxTeamSize > 1)
    parts.push(t(`${K}.limits.partner`, { max: c.maxTimesWithSamePartner }))
  return { id: 'limits', icon: 'fa-repeat', title: t(`${K}.limits.title`), text: parts.join(' ') }
}

function validationRow(tn: Tournament, t: Translate): SettingsRow {
  const key =
    tn.validationMode === 'auto' && tn.validationTimerHours
      ? `${K}.validation.autoTimer`
      : `${K}.validation.${tn.validationMode}`
  return {
    id: 'validation',
    icon: 'fa-circle-check',
    title: t(`${K}.validation.title`),
    text: t(key, { hours: tn.validationTimerHours }),
  }
}

function votesRow(tn: Tournament, t: Translate): SettingsRow | null {
  const v = resolveVoteConfig(tn.voteConfig)
  // MVP votes only open on team matches: in a strict 1v1 there is nobody to elect.
  const mvp = v.mvpEnabled && tn.maxTeamSize > 1
  if (!v.fairPlayEnabled && !mvp) return null
  const parts: string[] = []
  if (v.fairPlayEnabled) parts.push(t(`${K}.votes.fairPlay`))
  if (mvp) parts.push(t(v.mvpSpectatorsEnabled ? `${K}.votes.mvpSpectators` : `${K}.votes.mvp`))
  parts.push(t(`${K}.votes.noEffect`))
  return { id: 'votes', icon: 'fa-handshake', title: t(`${K}.votes.title`), text: parts.join(' ') }
}

/** What a player needs to know about a tournament's settings, in plain words. */
export function summarizeTournamentSettings(tn: Tournament, t: Translate): SettingsRow[] {
  const mode: SettingsRow = {
    id: 'mode',
    icon: 'fa-trophy',
    title: t(`${K}.mode.title`),
    text: t(`${K}.mode.${tn.mode}`),
  }
  return [
    mode,
    formatRow(tn, t),
    resultRow(tn, t),
    limitsRow(tn, t),
    validationRow(tn, t),
    votesRow(tn, t),
  ].filter((row): row is SettingsRow => row !== null)
}
