import type { VotePrompt } from '@skol-arena/shared/types/index'

export type VotePlayer = VotePrompt['sides'][number]['players'][number]

/** Players of a match by id, for the vote sections and the vote prompt. */
export function playersById(sides: { players: VotePlayer[] }[]): Map<string, VotePlayer> {
  return new Map(sides.flatMap((s) => s.players.map((p) => [p.id, p] as const)))
}
