import http from '@/config/ApiConfig.ts'
import type { OrganizationWithMemberCount, OrganizationMemberWithUser } from '@skol-arena/shared'

export const organizationApi = {
  async list(): Promise<OrganizationWithMemberCount[]> {
    const { data } = await http.get('/api/admin/organizations')
    return data
  },

  async create(
    name: string,
  ): Promise<{ id: string; name: string; createdBy: string; createdAt: Date }> {
    const { data } = await http.post('/api/admin/organizations', { name })
    return data
  },

  async getMembers(orgId: string): Promise<OrganizationMemberWithUser[]> {
    const { data } = await http.get(`/api/admin/organizations/${orgId}/members`)
    return data
  },

  async addMember(orgId: string, userId: string): Promise<void> {
    await http.post(`/api/admin/organizations/${orgId}/members`, { userId })
  },

  async removeMember(orgId: string, userId: string): Promise<void> {
    await http.delete(`/api/admin/organizations/${orgId}/members/${userId}`)
  },

  async rename(
    orgId: string,
    name: string,
  ): Promise<{ id: string; name: string; createdBy: string; createdAt: Date }> {
    const { data } = await http.patch(`/api/admin/organizations/${orgId}`, { name })
    return data
  },
}
