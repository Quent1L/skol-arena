import { describe, it, expect } from 'vitest'
import { createI18n } from 'vue-i18n'
import fr from '@/i18n/messages/fr.json'
import { summarizeTournamentSettings } from '../tournament-settings-summary'

const { t } = createI18n({ legacy: false, locale: 'fr', messages: { fr } }).global

const championship = {
  mode: 'championship' as const,
  teamMode: 'flex' as const,
  minTeamSize: 1,
  maxTeamSize: 1,
  allowDraw: false,
  scoreEnabled: true,
  minScore: 0,
  maxScore: 5,
  validationMode: 'auto' as const,
  validationTimerHours: 24,
  scoringConfig: { pointPerVictory: 3, pointPerDraw: 1, pointPerLoss: 0 },
  championshipConfig: {
    maxMatchesPerPlayer: 10,
    maxTimesWithSamePartner: 2,
    maxTimesWithSameOpponent: 2,
  },
  voteConfig: { fairPlayEnabled: true, mvpEnabled: true },
}

const summarize = (over: Partial<typeof championship> | Record<string, unknown> = {}) =>
  summarizeTournamentSettings(
    // Partial vote config on purpose: the summary resolves the defaults itself.
    { ...championship, ...over } as unknown as Parameters<typeof summarizeTournamentSettings>[0],
    t,
  )
const textOf = (rows: ReturnType<typeof summarize>, id: string) =>
  rows.find((r) => r.id === id)?.text

describe('summarizeTournamentSettings', () => {
  it('describes a 1v1 league in plain words', () => {
    const rows = summarize()
    expect(rows.map((r) => r.id)).toEqual([
      'mode',
      'format',
      'result',
      'limits',
      'validation',
      'votes',
    ])
    expect(textOf(rows, 'format')).toBe('Matchs en 1 contre 1 : chacun joue pour soi.')
    expect(textOf(rows, 'result')).toContain('entre 0 et 5')
    expect(textOf(rows, 'result')).toContain('Une victoire rapporte 3 pts, une défaite 0 pts.')
    expect(textOf(rows, 'validation')).toContain('après 24 h')
    // No teammate in 1v1: neither the partner cap nor the MVP vote apply.
    expect(textOf(rows, 'limits')).not.toContain('coéquipier')
    expect(textOf(rows, 'votes')).not.toContain('MVP')
  })

  it('describes a flex 1-to-2 ranked season without the league-only rows', () => {
    const rows = summarize({
      mode: 'ranked',
      maxTeamSize: 2,
      scoreEnabled: false,
      validationMode: 'none',
      scoringConfig: null,
      championshipConfig: null,
    })
    expect(rows.map((r) => r.id)).not.toContain('limits')
    expect(textOf(rows, 'format')).toBe(
      'Matchs de 1 contre 1 à 2 contre 2, les équipes se forment librement à chaque match.',
    )
    expect(textOf(rows, 'result')).toContain('Seul le vainqueur est saisi')
    expect(textOf(rows, 'votes')).toContain('MVP')
  })

  it('names fixed teams and drops the votes row when no vote is on', () => {
    const rows = summarize({
      teamMode: 'static',
      minTeamSize: 2,
      maxTeamSize: 2,
      voteConfig: { fairPlayEnabled: false, mvpEnabled: false },
    })
    expect(textOf(rows, 'format')).toContain('Équipes fixes de 2 joueurs')
    expect(rows.map((r) => r.id)).not.toContain('votes')
  })
})
