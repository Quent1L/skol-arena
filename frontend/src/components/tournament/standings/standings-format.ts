export function formatRatio(ratio: number): string {
  if (!isFinite(ratio)) return '∞'
  return ratio.toFixed(2)
}

export function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`
}
