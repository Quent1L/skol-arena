import { tournamentRepository } from "../repository/tournament.repository";
import { userRepository } from "../repository/user.repository";
import { participantRepository } from "../repository/participant.repository";
import { organizationRepository } from "../repository/organization.repository";
import { matchRepository } from "../repository/match.repository";
import { tournamentRulesetRepository } from "../repository/tournament-ruleset.repository";
import { tournamentRulesetService } from "./tournament-ruleset.service";
import { standingsService } from "./standings.service";
import { playerStatsService } from "./player-stats.service";
import { enqueueMmrSeasonRecalculation } from "./mmr-job-queue.service";
import {
  type CreateTournamentInput,
  type UpdateTournamentInput,
  type TournamentMode,
  type TournamentStatus,
  type JoinTournamentRequest,
  type EditabilityContext,
  type TournamentEditability,
  resolveScoringConfig,
  resolveChampionshipConfig,
  resolveEditableFields,
  resolveFieldEditability,
  updateTriggersRecalculation,
  policyFieldFor,
  TOURNAMENT_FIELD_POLICY,
  TOURNAMENT_STATUS_TRANSITIONS,
} from "@skol-arena/shared";
import {
  ErrorCode,
  NotFoundError,
  BadRequestError,
  ForbiddenError,
  ConflictError,
} from "../types/errors";

export class TournamentService {
  /**
   * Refuses a read of a competition scoped to an organization the caller is not in.
   *
   * The rule already existed, spelled out inside tournaments.route.ts and applied
   * only there; it lives here now so the routes that were missing it — the team
   * list, a match, a join, a WebSocket subscription — can reach the same decision
   * instead of each growing their own.
   *
   * `appUserId` is null for an anonymous caller. Competitions with no organization
   * stay readable by anyone, which is what makes the public tournament pages work.
   */
  async assertCanAccess(tournamentId: string, appUserId: string | null): Promise<void> {
    const tournament = await this.getTournamentById(tournamentId);
    await this.assertOrganizationAccess(tournament.organizationId, appUserId);
  }

  /**
   * The same rule, for callers that already hold the row. Saves re-reading the
   * tournament in the middle of a flow that has just fetched it.
   */
  async assertOrganizationAccess(
    organizationId: string | null | undefined,
    appUserId: string | null,
  ): Promise<void> {
    if (!organizationId) return;

    if (!appUserId) {
      throw new ForbiddenError(ErrorCode.ORGANIZATION_ACCESS_DENIED);
    }

    const viewer = await userRepository.getById(appUserId);
    if (!viewer) {
      throw new ForbiddenError(ErrorCode.ORGANIZATION_ACCESS_DENIED);
    }
    if (viewer.role === "super_admin") return;

    const isMember = await organizationRepository.isMember(organizationId, appUserId);
    if (!isMember) {
      throw new ForbiddenError(ErrorCode.ORGANIZATION_ACCESS_DENIED);
    }
  }

  /**
   * Check if user can manage tournament (owner, co_admin, or super_admin)
   */
  async canManageTournament(
    tournamentId: string,
    userId: string,
  ): Promise<boolean> {
    const user = await userRepository.getById(userId);

    if (!user) return false;
    if (user.role === "super_admin") return true;

    // Check if user is tournament admin (owner or co_admin)
    return await tournamentRepository.isUserTournamentAdmin(
      tournamentId,
      userId,
    );
  }

  /**
   * Check if user can create tournaments
   */
  async canCreateTournament(userId: string): Promise<boolean> {
    const user = await userRepository.getById(userId);

    if (!user) return false;
    return user.role === "tournament_admin" || user.role === "super_admin";
  }

  /**
   * Count draft tournaments for a user
   */
  async countDraftTournaments(userId: string): Promise<number> {
    return await tournamentRepository.countByUserAndStatus(userId, "draft");
  }

  /**
   * Create a new tournament
   */
  async createTournament(input: CreateTournamentInput) {
    await this.validateCreatePermissions(input.createdBy);
    await this.validateDraftLimit(input.createdBy);
    this.validateCreateInput(input);

    const tournament = await this.createTournamentRecord(input);
    await this.addCreatorAsOwner(tournament.id, input.createdBy);
    // Snapshot the discipline straight away. It keeps tracking while the
    // tournament is a draft and freezes when it opens.
    await tournamentRulesetService.seed(tournament.id, input.disciplineId);

    return tournament;
  }

  /**
   * Validate user can create tournament
   */
  private async validateCreatePermissions(userId: string) {
    const canCreate = await this.canCreateTournament(userId);
    if (!canCreate) {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS);
    }
  }

  /**
   * Validate draft limit (max 5)
   */
  private async validateDraftLimit(userId: string) {
    const draftCount = await this.countDraftTournaments(userId);
    if (draftCount >= 5) {
      throw new ConflictError(ErrorCode.MAX_DRAFT_TOURNAMENTS_EXCEEDED, {
        max: 5,
        current: draftCount,
      });
    }
  }

  /**
   * Validate create tournament input
   */
  private validateCreateInput(input: CreateTournamentInput) {
    this.validateDateRange(input.startDate, input.endDate);
    this.validateTeamSize(input.minTeamSize, input.maxTeamSize);
  }

  /**
   * Validate date range
   */
  private validateDateRange(startDateStr: string, endDateStr: string) {
    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    if (startDate >= endDate) {
      throw new BadRequestError(ErrorCode.INVALID_DATE_RANGE);
    }
  }

  /**
   * Validate team size
   */
  private validateTeamSize(minSize: number, maxSize: number) {
    if (minSize < 1) {
      throw new BadRequestError(ErrorCode.INVALID_TEAM_SIZE);
    }
    if (maxSize < minSize) {
      throw new BadRequestError(ErrorCode.INVALID_TEAM_SIZE);
    }
  }

  /**
   * Create tournament record
   */
  private async createTournamentRecord(input: CreateTournamentInput) {
    return await tournamentRepository.create({
      name: input.name,
      description: input.description,
      mode: input.mode,
      teamMode: input.teamMode,
      minTeamSize: input.minTeamSize,
      maxTeamSize: input.maxTeamSize,
      // Points apply to every mode that awards them; ranked runs on MMR instead.
      ...(input.mode !== "ranked" && {
        scoringConfig: resolveScoringConfig(input.scoringConfig),
      }),
      // The pairing caps only constrain user-created matches.
      ...(input.mode === "championship" && {
        championshipConfig: resolveChampionshipConfig(input.championshipConfig),
      }),
      allowDraw: input.allowDraw ?? true,
      scoreEnabled: input.scoreEnabled ?? true,
      startDate: input.startDate,
      endDate: input.endDate,
      disciplineId: input.disciplineId,
      minScore: input.minScore ?? null,
      maxScore: input.maxScore ?? null,
      validationMode: input.validationMode ?? "strict",
      validationTimerHours: input.validationTimerHours ?? null,
      createdBy: input.createdBy,
      status: "draft",
    });
  }

  /**
   * Add creator as tournament owner
   */
  private async addCreatorAsOwner(tournamentId: string, userId: string) {
    await tournamentRepository.addAdmin(tournamentId, userId, "owner");
  }

  /**
   * Get tournament by ID
   */
  async getTournamentById(id: string) {
    const tournament = await tournamentRepository.getById(id);

    if (!tournament) {
      throw new NotFoundError(ErrorCode.TOURNAMENT_NOT_FOUND);
    }

    return tournament;
  }

  /**
   * List all tournaments (with optional filters)
   */
  async listTournaments(
    filters?: {
      status?: TournamentStatus;
      mode?: TournamentMode;
      createdBy?: string;
    },
    appUser?: { id: string; role: string } | null,
  ) {
    const isAdmin = appUser?.role === "super_admin";
    const repoFilters = {
      ...filters,
      ...(!isAdmin && { excludeDraft: true }),
      // Exclude ranked seasons from the main tournament list (they have their own section)
      ...(!filters?.mode && { excludeRanked: true }),
      ...(appUser && { viewerId: appUser.id }),
    };
    const allTournaments = await tournamentRepository.list(repoFilters);

    if (isAdmin) return allTournaments;

    const userOrgIds = appUser
      ? await organizationRepository.getUserOrganizationIds(appUser.id)
      : [];

    return allTournaments.filter(
      (t) => !t.organizationId || userOrgIds.includes(t.organizationId),
    );
  }

  /**
   * Update tournament
   */
  async updateTournament(
    id: string,
    userId: string,
    input: UpdateTournamentInput,
  ) {
    await this.checkUpdatePermissions(id, userId);
    const tournament = await this.getTournamentById(id);
    const ctx = await this.buildEditabilityContext(tournament);

    await this.validateUpdateFields(ctx, input);
    this.validateUpdateDates(tournament, input);
    this.validateUpdateTeamSize(tournament, input);
    this.validateStatusChange(tournament, input);

    const updated = await tournamentRepository.update(id, {
      ...input,
      startDate: input.startDate,
      endDate: input.endDate,
    });

    // Opening the competition freezes the ruleset it will be played under.
    if (tournament.status === "draft" && input.status === "open") {
      await tournamentRulesetService.freeze(id);
    }

    // Points already awarded were computed from a rule that just moved, so they
    // no longer describe what happened. Recompute rather than leave the standings
    // saying one thing and the configuration another.
    if (updateTriggersRecalculation(Object.keys(input), ctx)) {
      await this.recalculateAfterRuleChange(id, tournament.mode);
    }

    return updated;
  }

  /**
   * What the admin form is allowed to offer. Derived from the same policy the
   * update path enforces, so the two cannot drift apart.
   */
  async getEditability(id: string): Promise<TournamentEditability> {
    const tournament = await this.getTournamentById(id);
    const ctx = await this.buildEditabilityContext(tournament);
    return { ...resolveEditableFields(ctx), enteredMatchCount: ctx.enteredMatchCount };
  }

  /** Everything the editability policy needs to judge an update. */
  private async buildEditabilityContext(
    tournament: NonNullable<Awaited<ReturnType<typeof tournamentRepository.getById>>>,
  ): Promise<EditabilityContext> {
    return {
      status: tournament.status,
      mode: tournament.mode,
      teamMode: tournament.teamMode,
      // A draft cannot have matches, so skip the query entirely.
      enteredMatchCount:
        tournament.status === "draft"
          ? 0
          : await matchRepository.countEnteredMatches(tournament.id),
    };
  }

  /**
   * A rule change on a competition that has already been played has to be
   * followed through: ranked replays its season in a worker, everything else
   * rewrites its awarded points on the spot.
   */
  private async recalculateAfterRuleChange(id: string, mode: TournamentMode) {
    if (mode === "ranked") {
      await tournamentRulesetRepository.setRecalcPending(id, new Date());
      await enqueueMmrSeasonRecalculation(id);
      return;
    }
    await standingsService.recalculatePointsInternal(id);
    await playerStatsService.invalidateCacheForTournament(id);
  }

  /**
   * Check user can update tournament
   */
  private async checkUpdatePermissions(tournamentId: string, userId: string) {
    const canManage = await this.canManageTournament(tournamentId, userId);
    if (!canManage) {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS);
    }
  }

  /**
   * Refuses what the competition's state no longer allows.
   *
   * The policy lives in the shared module so the form disables exactly what the
   * API refuses. Two refusals, deliberately distinct: a field frozen by the
   * competition's structure is a different problem for the admin than one frozen
   * because results have started coming in, and only the second can be explained
   * by a number.
   */
  private async validateUpdateFields(
    ctx: EditabilityContext,
    input: UpdateTournamentInput,
  ) {
    const attempted = Object.keys(input);
    const structural: string[] = [];
    const blockedByMatches: string[] = [];

    for (const field of attempted) {
      if (resolveFieldEditability(field, ctx) !== "locked") continue;

      const policy = TOURNAMENT_FIELD_POLICY[policyFieldFor(field)];
      if (policy?.tier === "untilMatches" && ctx.enteredMatchCount > 0) {
        blockedByMatches.push(field);
      } else {
        structural.push(field);
      }
    }

    if (structural.length > 0) {
      throw new BadRequestError(ErrorCode.TOURNAMENT_FIELD_UPDATE_FORBIDDEN, {
        fields: structural,
      });
    }
    if (blockedByMatches.length > 0) {
      throw new BadRequestError(ErrorCode.TOURNAMENT_FIELD_LOCKED_BY_MATCHES, {
        fields: blockedByMatches,
        matchCount: ctx.enteredMatchCount,
      });
    }
  }

  /**
   * The generic PATCH accepts `status`, and the admin form uses it rather than
   * the dedicated status route — so without this the transition table was simply
   * not enforced and any status could be set from any other, `finished` back to
   * `draft` included.
   */
  private validateStatusChange(
    tournament: { status: TournamentStatus },
    input: UpdateTournamentInput,
  ) {
    if (input.status === undefined || input.status === tournament.status) return;
    this.validateStatusTransition(tournament.status, input.status);
  }

  /**
   * Validate dates if provided in update
   */
  private validateUpdateDates(
    tournament: Awaited<ReturnType<typeof tournamentRepository.getById>>,
    input: UpdateTournamentInput,
  ) {
    if (!input.startDate && !input.endDate) {
      return;
    }

    const startDate = new Date(input.startDate ?? tournament?.startDate ?? "");
    const endDate = new Date(input.endDate ?? tournament?.endDate ?? "");
    if (startDate >= endDate) {
      throw new BadRequestError(ErrorCode.INVALID_DATE_RANGE);
    }
  }

  /**
   * Validate team size if provided in update
   */
  private validateUpdateTeamSize(
    tournament: Awaited<ReturnType<typeof tournamentRepository.getById>>,
    input: UpdateTournamentInput,
  ) {
    if (input.minTeamSize === undefined && input.maxTeamSize === undefined) {
      return;
    }

    const minSize = input.minTeamSize ?? tournament?.minTeamSize ?? 1;
    const maxSize = input.maxTeamSize ?? tournament?.maxTeamSize ?? 1;
    this.validateTeamSize(minSize, maxSize);
  }

  /**
   * Delete tournament
   */
  async deleteTournament(id: string, userId: string) {
    // Check permissions - only owner or super_admin can delete
    const user = await tournamentRepository.getUser(userId);

    if (!user) {
      throw new NotFoundError(ErrorCode.USER_NOT_FOUND);
    }

    const tournament = await this.getTournamentById(id);

    // Super admin can delete anything
    const isSuperAdmin = user.role === "super_admin";
    // Owner can delete their tournament
    const isOwner = tournament.createdBy === userId;

    if (!isSuperAdmin && !isOwner) {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS);
    }

    // Can only delete if status is draft
    if (tournament.status !== "draft") {
      throw new BadRequestError(ErrorCode.TOURNAMENT_CANNOT_BE_DELETED);
    }

    // Delete tournament (cascade will handle related records)
    await tournamentRepository.delete(id);

    return { success: true, message: "Tournament deleted successfully" };
  }

  /**
   * Change tournament status
   */
  async changeTournamentStatus(
    id: string,
    userId: string,
    newStatus: TournamentStatus,
  ) {
    await this.checkUpdatePermissions(id, userId);
    const tournament = await this.getTournamentById(id);
    this.validateStatusTransition(tournament.status, newStatus);

    const updated = await tournamentRepository.update(id, {
      status: newStatus,
    });

    // Opening the tournament is the last moment the ruleset can move on its own:
    // from here a match can be entered, so what the discipline says stops
    // mattering and only an explicit propagation may change it.
    if (tournament.status === "draft" && newStatus === "open") {
      await tournamentRulesetService.freeze(id);
    }

    return updated;
  }

  /**
   * Validate status transition is allowed
   */
  private validateStatusTransition(
    currentStatus: TournamentStatus,
    newStatus: TournamentStatus,
  ) {
    const allowedTransitions = TOURNAMENT_STATUS_TRANSITIONS[currentStatus];
    if (!allowedTransitions.includes(newStatus)) {
      throw new BadRequestError(ErrorCode.INVALID_STATUS_TRANSITION, {
        from: currentStatus,
        to: newStatus,
      });
    }
  }

  /**
   * Join tournament as participant
   */
  async joinTournament(userId: string, data: JoinTournamentRequest) {
    const tournament = await this.getTournamentForJoin(data.tournamentId);

    // Entering is a read plus a write: someone who may not even see a competition
    // scoped to an organization must not be able to register themselves into it.
    await this.assertOrganizationAccess(tournament.organizationId, userId);

    this.validateTournamentOpenForJoin(tournament);
    await this.checkNotAlreadyRegistered(userId, data.tournamentId);

    const participation = await participantRepository.createParticipation(
      userId,
      data.tournamentId,
    );

    return await participantRepository.findParticipationWithDetails(
      participation.id,
    );
  }

  /**
   * Get tournament for join validation
   */
  private async getTournamentForJoin(tournamentId: string) {
    const tournament =
      await participantRepository.findTournamentById(tournamentId);
    if (!tournament) {
      throw new NotFoundError(ErrorCode.TOURNAMENT_NOT_FOUND);
    }
    return tournament;
  }

  /**
   * Validate tournament is open for joining
   */
  private validateTournamentOpenForJoin(
    tournament: Awaited<
      ReturnType<typeof participantRepository.findTournamentById>
    >,
  ) {
    if (!tournament || !["open", "ongoing"].includes(tournament.status)) {
      throw new BadRequestError(ErrorCode.TOURNAMENT_CLOSED);
    }
  }

  /**
   * Check user is not already registered
   */
  private async checkNotAlreadyRegistered(
    userId: string,
    tournamentId: string,
  ) {
    const existingParticipation =
      await participantRepository.findParticipationByUserAndTournament(
        userId,
        tournamentId,
      );

    if (existingParticipation) {
      throw new ConflictError(ErrorCode.ALREADY_REGISTERED);
    }
  }

  /**
   * Admin adds a participant to tournament
   */
  async adminAddParticipant(
    adminUserId: string,
    tournamentId: string,
    targetUserId: string,
  ) {
    const canManage = await this.canManageTournament(tournamentId, adminUserId);
    if (!canManage) {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS);
    }

    const tournament = await this.getTournamentForJoin(tournamentId);
    if (!tournament) {
      throw new NotFoundError(ErrorCode.TOURNAMENT_NOT_FOUND);
    }

    const targetUser = await userRepository.getById(targetUserId);
    if (!targetUser) {
      throw new NotFoundError(ErrorCode.USER_NOT_FOUND);
    }

    await this.checkNotAlreadyRegistered(targetUserId, tournamentId);

    const participation = await participantRepository.createParticipation(
      targetUserId,
      tournamentId,
    );

    return await participantRepository.findParticipationWithDetails(
      participation.id,
    );
  }

  /**
   * Leave tournament
   */
  async leaveTournament(userId: string, tournamentId: string) {
    // Verify tournament exists
    const tournament =
      await participantRepository.findTournamentById(tournamentId);

    if (!tournament) {
      throw new NotFoundError(ErrorCode.TOURNAMENT_NOT_FOUND);
    }

    // Don't allow leaving ongoing or finished tournaments
    if (["ongoing", "finished"].includes(tournament.status)) {
      throw new BadRequestError(ErrorCode.CANNOT_LEAVE_ONGOING_TOURNAMENT);
    }

    // Verify user is registered
    const participation =
      await participantRepository.findParticipationByUserAndTournament(
        userId,
        tournamentId,
      );

    if (!participation) {
      throw new BadRequestError(ErrorCode.NOT_REGISTERED);
    }

    // Remove participation
    await participantRepository.deleteParticipation(participation.id);

    return { message: "Vous avez quitté le tournoi avec succès" };
  }

  /**
   * Get tournament participants
   */
  async getTournamentParticipants(tournamentId: string) {
    return await participantRepository.findTournamentParticipants(tournamentId);
  }

  /**
   * Admin removes a participant from tournament
   */
  async adminRemoveParticipant(
    adminUserId: string,
    tournamentId: string,
    targetUserId: string,
  ) {
    const canManage = await this.canManageTournament(tournamentId, adminUserId);
    if (!canManage) {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS);
    }

    const participation =
      await participantRepository.findParticipationByUserAndTournament(
        targetUserId,
        tournamentId,
      );

    if (!participation) {
      throw new NotFoundError(ErrorCode.NOT_REGISTERED);
    }

    await participantRepository.hardDeleteParticipation(participation.id);

    return { success: true };
  }
}

export const tournamentService = new TournamentService();
