import type { ClientRuleFiringRecipient } from '@skol-arena/shared/types/index'

type Translate = (key: string) => string

/** The fields a fate is read from — shared by recipients and feed items. */
export type FiringFateFields = Pick<
  ClientRuleFiringRecipient,
  'result' | 'deliveredAt' | 'seenSurface'
>

export function resultColor(result: string) {
  return result === 'selected' || result === 'awarded' ? 'success' : 'neutral'
}

/**
 * What became of this firing. `superseded` never had a chance to be delivered, so
 * it reads as its own outcome rather than as an undelivered message.
 */
export function fateLabel(t: Translate, row: FiringFateFields) {
  if (row.result === 'superseded') return t('rulesEngineStats.fate.superseded')
  if (row.result === 'already_held') return t('rulesEngineStats.fate.alreadyHeld')
  if (!row.deliveredAt) return t('rulesEngineStats.fate.notDelivered')
  if (row.seenSurface === 'recap') return t('rulesEngineStats.fate.recap')
  if (row.seenSurface) return t('rulesEngineStats.fate.seen')
  return t('rulesEngineStats.fate.pending')
}

export function fateColor(row: FiringFateFields) {
  if (row.seenSurface === 'recap') return 'warning'
  if (row.seenSurface) return 'success'
  if (!row.deliveredAt) return 'error'
  return 'neutral'
}
