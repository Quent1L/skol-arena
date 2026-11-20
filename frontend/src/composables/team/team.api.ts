import http from '@/config/ApiConfig'
import type { ClientTeam, CreateTeamInput } from '@skol-arena/shared/types/index'

export const teamApi = {
  list: (tournamentId: string) =>
    http.get<ClientTeam[]>(`/api/tournaments/${tournamentId}/teams`).then((r) => r.data),

  create: (tournamentId: string, data: CreateTeamInput) =>
    http.post<ClientTeam>(`/api/tournaments/${tournamentId}/teams`, data).then((r) => r.data),

  join: (tournamentId: string, teamId: string, userId?: string) =>
    http
      .post<ClientTeam>(`/api/tournaments/${tournamentId}/teams/${teamId}/join`, { userId })
      .then((r) => r.data),

  leave: (tournamentId: string, teamId: string) =>
    http
      .delete<{ success: boolean }>(`/api/tournaments/${tournamentId}/teams/${teamId}/leave`)
      .then((r) => r.data),

  delete: (tournamentId: string, teamId: string) =>
    http
      .delete<{ success: boolean }>(`/api/tournaments/${tournamentId}/teams/${teamId}`)
      .then((r) => r.data),
}
