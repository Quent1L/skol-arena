import { tournamentRulesetRepository } from "../repository/tournament-ruleset.repository";
import { resolveRuleset, rulesetsEqual, type TournamentRulesetPayload } from "@skol-arena/shared/types/index";

/**
 * Lifecycle of the ruleset a competition is played under.
 *
 * Deliberately free of any calculation import — propagation and the
 * recalculations it triggers live in ruleset-propagation.service, so that
 * tournament.service can seed and freeze snapshots without dragging the
 * standings and MMR services into a cycle.
 */
export class TournamentRulesetService {
  /**
   * The ruleset in force.
   *
   * Expressed as a function of status rather than of the draft → open
   * transition: four code paths write `tournaments.status`, and a snapshot that
   * only froze on a transition hook would silently reopen the bug the first time
   * one of them was missed. While the competition is a draft the snapshot tracks
   * the discipline — no match can exist yet, `match.service` gates creation on
   * open|ongoing — and past that the stored payload is returned verbatim.
   */
  async getForTournament(tournamentId: string): Promise<TournamentRulesetPayload> {
    const context = await tournamentRulesetRepository.getSnapshotContext(tournamentId);
    if (!context) return resolveRuleset(null);

    if (context.status === "draft") {
      return await this.resyncDraft(tournamentId, context.disciplineId);
    }

    const stored = await tournamentRulesetRepository.getByTournamentId(tournamentId);
    if (stored) return stored.payload;

    // No row: a competition that predates the snapshot and was opened before the
    // backfill could reach it. Seed it once from the discipline rather than
    // handing back an empty ruleset, which would zero every tiebreaker.
    return await this.seed(tournamentId, context.disciplineId);
  }

  async getRow(tournamentId: string) {
    return await tournamentRulesetRepository.getByTournamentId(tournamentId);
  }

  /** Called when a competition is created, inside the caller's transaction scope. */
  async seed(tournamentId: string, disciplineId: string | null | undefined): Promise<TournamentRulesetPayload> {
    const payload = await tournamentRulesetRepository.buildPayloadForTournament(tournamentId, disciplineId);
    await tournamentRulesetRepository.upsert(tournamentId, payload);
    return payload;
  }

  /**
   * Pins the ruleset as it stands. Idempotent, and called explicitly on
   * draft → open and on season start so the row exists even if nobody read it
   * while the competition was a draft.
   */
  async freeze(tournamentId: string): Promise<void> {
    const context = await tournamentRulesetRepository.getSnapshotContext(tournamentId);
    if (!context) return;

    const stored = await tournamentRulesetRepository.getByTournamentId(tournamentId);
    const fresh = await tournamentRulesetRepository.buildPayloadForTournament(tournamentId, context.disciplineId);

    if (!stored || !rulesetsEqual(stored.payload, fresh)) {
      await tournamentRulesetRepository.upsert(tournamentId, fresh);
    }
  }

  /** Re-seeds a draft only when the discipline has actually moved, to keep reads cheap. */
  private async resyncDraft(
    tournamentId: string,
    disciplineId: string | null | undefined,
  ): Promise<TournamentRulesetPayload> {
    const fresh = await tournamentRulesetRepository.buildPayloadForTournament(tournamentId, disciplineId);
    const stored = await tournamentRulesetRepository.getByTournamentId(tournamentId);

    if (!stored || !rulesetsEqual(stored.payload, fresh)) {
      await tournamentRulesetRepository.upsert(tournamentId, fresh);
    }
    return fresh;
  }
}

export const tournamentRulesetService = new TournamentRulesetService();
