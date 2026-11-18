import type { RewindAwardKey } from '@skol-arena/shared/types/index'

/**
 * Visual identity of each season award. Kept in one table so the four themed
 * cards stay consistent and adding an award is a one-line change.
 */
export const AWARD_STYLE: Record<RewindAwardKey, { icon: string; accent: string }> = {
  king: { icon: 'fa fa-crown', accent: '#fbbf24' },
  peakMmr: { icon: 'fa fa-mountain', accent: '#a855f7' },
  progression: { icon: 'fa fa-arrow-trend-up', accent: '#34d399' },
  sniper: { icon: 'fa fa-crosshairs', accent: '#38bdf8' },
  biggestUpset: { icon: 'fa fa-bolt', accent: '#f97316' },
  giantKiller: { icon: 'fa fa-hammer', accent: '#f87171' },
  leaderHunter: { icon: 'fa fa-chess-king', accent: '#fb923c' },
  rivalry: { icon: 'fa fa-fire-flame-curved', accent: '#ef4444' },
  nemesis: { icon: 'fa fa-skull', accent: '#a3a3a3' },
  marathon: { icon: 'fa fa-person-running', accent: '#60a5fa' },
  topOneKing: { icon: 'fa fa-trophy', accent: '#fbbf24' },
  topThreeKing: { icon: 'fa fa-medal', accent: '#e879f9' },
  topFiveKing: { icon: 'fa fa-ranking-star', accent: '#22d3ee' },
  longestStreak: { icon: 'fa fa-fire', accent: '#fb7185' },
  duo: { icon: 'fa fa-people-group', accent: '#4ade80' },
  bestPartner: { icon: 'fa fa-handshake', accent: '#2dd4bf' },
  fairPlayPrize: { icon: 'fa fa-trophy', accent: '#a78bfa' },
  teamCarrier: { icon: 'fa fa-mask', accent: '#fbbf24' },
  mostInvolved: { icon: 'fa fa-check-to-slot', accent: '#38bdf8' },
  kindest: { icon: 'fa fa-heart', accent: '#f472b6' },
  strictestJudge: { icon: 'fa fa-scale-balanced', accent: '#f59e0b' },
  topSupporter: { icon: 'fa fa-eye', accent: '#4ade80' },
  fairPlayWorst: { icon: 'fa fa-thumbs-down', accent: '#a3a3a3' },
}
