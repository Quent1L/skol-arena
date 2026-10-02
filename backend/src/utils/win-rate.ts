/**
 * The one win rate every stat screen shows: wins over every finalized match played.
 * A result that is neither a win, a loss nor an allowed draw (a tie where draws are
 * not allowed) still counts as played, so the same match never yields different
 * rates depending on the screen.
 */
export function winRatePercent(wins: number, played: number): number {
  return played > 0 ? Math.round((wins / played) * 100) : 0;
}
