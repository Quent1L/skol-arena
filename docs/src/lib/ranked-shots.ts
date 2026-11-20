import type { ImageMetadata } from 'astro'
import rankedDesktop from '../assets/screenshots/ranked-desktop.png'
import rankedMobile from '../assets/screenshots/ranked-mobile.png'
import profileDesktop from '../assets/screenshots/season-profile-desktop.png'
import profileMobile from '../assets/screenshots/season-profile-mobile.png'
import seasonStatsDesktop from '../assets/screenshots/season-stats-desktop.png'
import seasonStatsMobile from '../assets/screenshots/season-stats-mobile.png'

export interface DeviceSlide {
  desktop: ImageMetadata
  mobile: ImageMetadata
  alt: string
  caption?: string
  /** Short label for the carousel dot's accessible name. */
  label: string
}

/**
 * The three views a ranked season actually consists of: the ladder, one
 * player's place in it, and the season summed up.
 *
 * Shared rather than restated, because both the homepage section and the
 * /features flagship block show the same carousel — two copies would drift the
 * moment a caption is reworded.
 */
export const RANKED_SLIDES: DeviceSlide[] = [
  {
    desktop: rankedDesktop,
    mobile: rankedMobile,
    alt: 'A ranked leaderboard grouped into Legend, Expert, Advanced and Challenger tiers',
    caption: 'Rank tiers that follow the player pool, not fixed bands',
    label: 'The ladder',
  },
  {
    desktop: profileDesktop,
    mobile: profileMobile,
    alt: "A player's own season profile: current rank, MMR, LP progress to the next tier, win rate and streaks",
    caption: "What the season looks like from one player's side",
    label: 'A player profile',
  },
  {
    desktop: seasonStatsDesktop,
    mobile: seasonStatsMobile,
    alt: "A season's stats view: match outcome distribution, activity over time, and current win and loss streaks",
    caption: 'A season, summed up',
    label: 'Season stats',
  },
]
