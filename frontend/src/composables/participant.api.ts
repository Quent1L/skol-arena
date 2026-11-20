import http from '@/config/ApiConfig'
import type { JoinTournamentResponse, ParticipantListItem } from '@skol-arena/shared/types/index'

export interface ParticipantAPI {
  joinTournament: (tournamentId: string) => Promise<JoinTournamentResponse>
  leaveTournament: (tournamentId: string) => Promise<{ message: string }>
  getTournamentParticipants: (tournamentId: string) => Promise<ParticipantListItem[]>
  adminAddParticipant: (tournamentId: string, userId: string) => Promise<JoinTournamentResponse>
  adminRemoveParticipant: (tournamentId: string, userId: string) => Promise<{ success: boolean }>
}

export const participantApi: ParticipantAPI = {
  async joinTournament(tournamentId: string) {
    const response = await http.post(`/api/tournaments/${tournamentId}/participants`, {
      tournamentId,
    })
    return response.data
  },

  async leaveTournament(tournamentId: string) {
    const response = await http.delete(`/api/tournaments/${tournamentId}/participants`)
    return response.data
  },

  async getTournamentParticipants(tournamentId: string) {
    const response = await http.get(`/api/tournaments/${tournamentId}/participants`)
    return response.data
  },

  async adminAddParticipant(tournamentId: string, userId: string) {
    const response = await http.post(`/api/tournaments/${tournamentId}/participants/add`, {
      userId,
    })
    return response.data
  },

  async adminRemoveParticipant(tournamentId: string, userId: string) {
    const response = await http.delete(`/api/tournaments/${tournamentId}/participants/${userId}`)
    return response.data
  },
}
