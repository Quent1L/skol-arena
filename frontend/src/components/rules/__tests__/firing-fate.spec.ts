import { describe, it, expect } from 'vitest'
import { fateColor, fateLabel, resultColor } from '../firing-fate'

const t = (key: string) => key
const delivered = new Date()

describe('firing fate', () => {
  it('reads a superseded or already-held firing as its own outcome', () => {
    expect(fateLabel(t, { result: 'superseded', deliveredAt: null, seenSurface: null })).toBe(
      'rulesEngineStats.fate.superseded',
    )
    expect(fateLabel(t, { result: 'already_held', deliveredAt: null, seenSurface: null })).toBe(
      'rulesEngineStats.fate.alreadyHeld',
    )
  })

  it('follows a selected message from delivery to the surface it was read on', () => {
    const base = { result: 'selected' as const }
    expect(fateLabel(t, { ...base, deliveredAt: null, seenSurface: null })).toBe(
      'rulesEngineStats.fate.notDelivered',
    )
    expect(fateLabel(t, { ...base, deliveredAt: delivered, seenSurface: null })).toBe(
      'rulesEngineStats.fate.pending',
    )
    expect(fateLabel(t, { ...base, deliveredAt: delivered, seenSurface: 'recap' })).toBe(
      'rulesEngineStats.fate.recap',
    )
    expect(fateLabel(t, { ...base, deliveredAt: delivered, seenSurface: 'reveal_skipped' })).toBe(
      'rulesEngineStats.fate.seen',
    )
  })

  it('colours a recap as a warning and an undelivered message as an error', () => {
    expect(fateColor({ result: 'selected', deliveredAt: delivered, seenSurface: 'recap' })).toBe(
      'warning',
    )
    expect(fateColor({ result: 'selected', deliveredAt: delivered, seenSurface: 'reveal' })).toBe(
      'success',
    )
    expect(fateColor({ result: 'selected', deliveredAt: null, seenSurface: null })).toBe('error')
    expect(resultColor('awarded')).toBe('success')
    expect(resultColor('already_held')).toBe('neutral')
  })
})
