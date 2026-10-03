import http from '@/config/ApiConfig'
import type { AvatarLookupResponse, AvatarUploadResponse } from '@skol-arena/shared'

const BASE_URL = '/api/users'

/**
 * Raw API calls for avatar endpoints
 */
export const avatarApi = {
  /** Upload or replace the current user's avatar. */
  async upload(image: Blob): Promise<AvatarUploadResponse> {
    const form = new FormData()
    form.append('file', image, 'avatar')
    const response = await http.put<AvatarUploadResponse>(`${BASE_URL}/me/avatar`, form)
    return response.data
  },

  /** Remove the current user's avatar. */
  async remove(): Promise<void> {
    await http.delete(`${BASE_URL}/me/avatar`)
  },

  /** Remove another player's avatar (moderation). */
  async removeFor(userId: string): Promise<void> {
    await http.delete(`${BASE_URL}/${userId}/avatar`)
  },

  /** Current avatar version of each requested player who has one. */
  async lookup(ids: string[]): Promise<AvatarLookupResponse> {
    const response = await http.post<AvatarLookupResponse>(`${BASE_URL}/avatars/lookup`, { ids })
    return response.data
  },
}
