import { z } from "zod";

// Base schema for a tournament participant
export const participantSchema = z.object({
  id: z.uuid(),
  tournamentId: z.uuid(),
  userId: z.uuid(),
  teamId: z.uuid().nullable(),
  matchesPlayed: z.number().int().min(0),
  joinedAt: z.coerce.date(),
});

// Schema for joining a tournament
export const joinTournamentSchema = z.object({
  tournamentId: z.uuid(),
});

// Schema for an admin adding a participant
export const adminAddParticipantSchema = z.object({
  userId: z.uuid(),
});

// Schema for the join response
export const joinTournamentResponseSchema = z.object({
  id: z.uuid(),
  tournamentId: z.uuid(),
  userId: z.uuid(),
  teamId: z.uuid().nullable(),
  matchesPlayed: z.number().int().min(0),
  joinedAt: z.coerce.date(),
  tournament: z.object({
    id: z.uuid(),
    name: z.string(),
    status: z.enum(["draft", "open", "ongoing", "finished"]),
    mode: z.enum(["championship", "bracket"]),
  }),
  user: z.object({
    id: z.uuid(),
    displayName: z.string(),
  }),
});

// Schema for the participant list
export const participantListItemSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  teamId: z.uuid().nullable(),
  matchesPlayed: z.number().int().min(0),
  joinedAt: z.coerce.date(),
  user: z.object({
    id: z.uuid(),
    displayName: z.string(),
    role: z.string(),
  }),
});

// Inferred types
export type Participant = z.infer<typeof participantSchema>;
export type JoinTournamentRequest = z.infer<typeof joinTournamentSchema>;
export type JoinTournamentResponse = z.infer<typeof joinTournamentResponseSchema>;
export type ParticipantListItem = z.infer<typeof participantListItemSchema>;
export type AdminAddParticipantRequest = z.infer<typeof adminAddParticipantSchema>;
