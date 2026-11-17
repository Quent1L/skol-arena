import http from '@/config/ApiConfig'
import type {
  Announcement,
  AnnouncementPopup,
  CreateAnnouncementInput,
  WithClientDates,
} from '@skol-arena/shared'

export type ClientAnnouncement = WithClientDates<Announcement>
export type ClientAnnouncementPopup = WithClientDates<AnnouncementPopup>

const BASE_URL = '/api'

export const announcementApi = {
  async list(tournamentId?: string): Promise<ClientAnnouncement[]> {
    const res = await http.get<ClientAnnouncement[]>(`${BASE_URL}/announcements`, {
      params: tournamentId ? { tournamentId } : {},
    })
    return res.data
  },
  async create(payload: CreateAnnouncementInput): Promise<{ id: string }> {
    const res = await http.post<{ id: string }>(`${BASE_URL}/announcements`, payload)
    return res.data
  },
  async delete(id: string): Promise<void> {
    await http.delete(`${BASE_URL}/announcements/${id}`)
  },
  async pending(tournamentId?: string): Promise<ClientAnnouncementPopup[]> {
    const res = await http.get<ClientAnnouncementPopup[]>(`${BASE_URL}/me/announcements/pending`, {
      params: tournamentId ? { tournamentId } : {},
    })
    return res.data
  },
  async markSeen(id: string): Promise<void> {
    await http.post(`${BASE_URL}/me/announcements/${id}/seen`)
  },
}
