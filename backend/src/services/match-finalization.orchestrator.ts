import { bracketService } from './bracket.service'
import { notificationService } from './notification.service'
import { rankedSeasonRepository } from '../repository/ranked-season.repository'
import { standingsService } from './standings.service'
import { matchRepository } from '../repository/match.repository'
import { playerComputedDataRepository } from '../repository/player-computed-data.repository'
import { tournamentStatsRepository } from '../repository/tournament-stats.repository'
import * as mmrJobQueueService from './mmr-job-queue.service'

export class MatchFinalizationOrchestrator {
  async runPostFinalizationEffects(
    matchId: string,
    tournamentId: string,
    backgroundTasks?: Promise<void>[],
  ): Promise<void> {
    await notificationService.deleteActionsByMatchId(matchId)
    await bracketService.advanceWinnerToNextRound(matchId)
    await bracketService.advanceLoserToNextRound(matchId)

    const rankedConfig = await rankedSeasonRepository.getConfigByTournamentId(tournamentId)
    if (rankedConfig) {
      const enqueueTask = mmrJobQueueService.enqueueMmrFinalization(matchId, tournamentId)
      if (backgroundTasks) {
        backgroundTasks.push(enqueueTask)
      } else {
        await enqueueTask
      }
    }

    await this.refreshStandingsAndStats(tournamentId, matchId)
  }

  async runPostCancellationEffects(matchId: string, tournamentId: string, cancelledMatchPlayedAt: Date): Promise<void> {
    const rankedConfig = await rankedSeasonRepository.getConfigByTournamentId(tournamentId)
    if (rankedConfig) {
      await mmrJobQueueService.enqueueMmrCascade(matchId, tournamentId, cancelledMatchPlayedAt)
    }
    await this.refreshStandingsAndStats(tournamentId, matchId)
  }

  /**
   * A corrected result is replayed from its own date: MMR is rebuilt in the match's
   * queue, after any finalization still pending there, and the standings and stats
   * are recomputed or dropped like after any other change of result.
   */
  async runPostCorrectionEffects(matchId: string, tournamentId: string): Promise<void> {
    const rankedConfig = await rankedSeasonRepository.getConfigByTournamentId(tournamentId)
    if (rankedConfig) {
      await mmrJobQueueService.enqueueMmrCorrection(matchId, tournamentId)
    }
    await this.refreshStandingsAndStats(tournamentId, matchId)
  }

  private async refreshStandingsAndStats(tournamentId: string, matchId: string): Promise<void> {
    const tournament = await matchRepository.getTournament(tournamentId)
    if (tournament?.mode === 'championship') {
      if (tournament.teamMode === 'flex' && tournament.championshipConfig) {
        await standingsService.recalculatePointsInternal(tournamentId)
      } else {
        await standingsService.invalidateCache(tournamentId)
      }
    }
    const playerIds = await matchRepository.getPlayerIdsForMatch(matchId)
    if (playerIds.length > 0) {
      await playerComputedDataRepository.deleteMany(playerIds)
    }
    await tournamentStatsRepository.deleteComputedStats(tournamentId)
  }
}

export const matchFinalizationOrchestrator = new MatchFinalizationOrchestrator()
