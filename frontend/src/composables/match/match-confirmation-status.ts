/**
 * Where a match stands in its validation round, per player. The detail view paints this
 * next to the names in the scoreboard and MatchConfirmation counts it, so the mapping
 * lives here rather than being rebuilt on either side.
 */
import { useI18n } from 'vue-i18n'
import type { ClientMatchDetail } from '@skol-arena/shared/types/index'

export type ConfirmationStatus = 'confirmed' | 'contested' | 'pending'

const ICON: Record<ConfirmationStatus, string> = {
  confirmed: 'fa-circle-check',
  contested: 'fa-circle-xmark',
  pending: 'fa-hourglass-half',
}

const TEXT_CLASS: Record<ConfirmationStatus, string> = {
  confirmed: 'text-match-win',
  contested: 'text-match-loss',
  pending: 'text-muted',
}

const LABEL_KEY: Record<ConfirmationStatus, string> = {
  confirmed: 'matchConfirmation.tagAccepted',
  contested: 'matchConfirmation.tagContested',
  pending: 'matchConfirmation.tagPending',
}

/**
 * playerId → status, for every participant. Post-finalization confirmations are a
 * different conversation (a late dispute on a settled match) and are left out.
 *
 * The reporter is auto-confirmed on entry, backend side, so they always read as confirmed.
 */
export function buildConfirmationStatusMap(
  match: ClientMatchDetail,
): Map<string, ConfirmationStatus> {
  const confirmations = (match.confirmations ?? []).filter((c) => !c.isPostFinalization)
  const byPlayer = new Map(confirmations.map((c) => [c.playerId, c]))

  const statuses = new Map<string, ConfirmationStatus>()
  for (const side of match.sides) {
    for (const player of side.players) {
      const confirmation = byPlayer.get(player.id)
      let status: ConfirmationStatus = 'pending'
      if (confirmation?.isConfirmed) status = 'confirmed'
      else if (confirmation?.isContested) status = 'contested'
      statuses.set(player.id, status)
    }
  }
  return statuses
}

export function confirmationStatusIcon(status: ConfirmationStatus): string {
  return ICON[status]
}

export function confirmationStatusClass(status: ConfirmationStatus): string {
  return TEXT_CLASS[status]
}

export function confirmationStatusLabelKey(status: ConfirmationStatus): string {
  return LABEL_KEY[status]
}

export function useConfirmationStatus() {
  const { t } = useI18n()

  return {
    statusLabel: (status: ConfirmationStatus) => t(confirmationStatusLabelKey(status)),
    statusIcon: confirmationStatusIcon,
    statusClass: confirmationStatusClass,
  }
}
