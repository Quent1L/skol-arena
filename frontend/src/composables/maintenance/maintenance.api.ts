import http from '@/config/ApiConfig'
import type {
  AvatarMigrationResult,
  MaintenanceStatus,
  SystemInfo,
} from '@skol-arena/shared/types/index'

// Raw API calls to backend - no business logic here
const BASE_URL = '/api/admin/maintenance'

export const maintenanceApi = {
  async getSystemInfo(): Promise<SystemInfo> {
    const { data } = await http.get<SystemInfo>(BASE_URL)
    return data
  },

  async getStatus(): Promise<MaintenanceStatus> {
    const { data } = await http.get<MaintenanceStatus>(`${BASE_URL}/status`)
    return data
  },

  async migrateAvatars(): Promise<AvatarMigrationResult> {
    const { data } = await http.post<AvatarMigrationResult>(`${BASE_URL}/avatars/migrate`)
    return data
  },
}
