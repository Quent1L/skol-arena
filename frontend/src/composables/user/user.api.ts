import http from '@/config/ApiConfig'
import type { UserPreferences } from '@skol-arena/shared'

const BASE_URL = '/api/users'

export interface UserResponse {
  id: string
  externalId: string
  displayName: string
  shortName: string
  role: 'player' | 'tournament_admin' | 'super_admin' | 'kiosk'
  /** Current avatar version; null when the user has none. */
  avatarVersion: string | null
  /** Match entry starts with this user already picked. */
  autoSelectSelfInMatch: boolean
  createdAt: string
  updatedAt: string
  betterAuth: {
    id: string
    email: string
    name: string | null
    image: string | null
    emailVerified: boolean
    createdAt: string
    updatedAt: string
  }
}

/**
 * Raw API calls for user endpoints
 */
export const userApi = {
  /**
   * Get current user details
   */
  async me(): Promise<UserResponse> {
    const response = await http.get<UserResponse>(`${BASE_URL}/me`)
    return response.data
  },

  /**
   * Update current user profile
   */
  async updateProfile(data: { displayName: string; shortName: string }): Promise<UserResponse> {
    const response = await http.patch<UserResponse>(`${BASE_URL}/me`, data)
    return response.data
  },

  async updatePreferences(data: UserPreferences): Promise<UserPreferences> {
    const response = await http.patch<UserPreferences>(`${BASE_URL}/me/preferences`, data)
    return response.data
  },

  /**
   * Get all users (admin only)
   */
  async list(): Promise<UserResponse[]> {
    const response = await http.get<UserResponse[]>(`${BASE_URL}`)
    return response.data
  },
}
