// Re-export schemas and types from the shared package
export {
  tournamentModeSchema,
  teamModeSchema,
  tournamentStatusSchema,
  createTournamentSchema,
  createTournamentRequestSchema,
  updateTournamentSchema,
  changeTournamentStatusSchema,
  listTournamentsQuerySchema,
  type CreateTournamentInput,
  type CreateTournamentRequestData,
  type UpdateTournamentInput,
  type ChangeTournamentStatusInput,
  type ListTournamentsQuery,
} from "@skol-arena/shared/types/index";

// Re-export des types participants
export {
  joinTournamentSchema,
  type JoinTournamentRequest,
  adminAddParticipantSchema,
  type AdminAddParticipantRequest,
} from "@skol-arena/shared/types/index";
