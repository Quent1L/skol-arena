import http from '@/config/ApiConfig.ts'

export interface ValidateCodeResponse {
  valid: boolean
  /** null = unlimited */
  remainingUses: number | null
  organizationId?: string
  organizationName?: string
}

export interface InvitationCode {
  id: string
  code: string
  createdBy: string
  createdAt: Date
  expiresAt: Date | null
  /** null = unlimited */
  maxUses: number | null
  usedCount: number
  isActive: boolean
  notes: string | null
  creator?: {
    id: string
    displayName: string
  }
  usages?: Array<{
    id: string
    usedAt: Date
    email: string
  }>
}

export interface GenerateCodeInput {
  code?: string
  maxUses?: number | null
  expiresInDays?: number
  notes?: string
  organizationId?: string
}

export interface ConsumeCodeResponse {
  success: boolean
  appUserId: string
}

export const invitationApi = {
  async validate(code: string): Promise<ValidateCodeResponse> {
    const { data } = await http.post('/api/invitations/validate', { code })
    return data
  },

  async consume(code: string): Promise<ConsumeCodeResponse> {
    const { data } = await http.post('/api/invitations/consume', { code })
    return data
  },

  async generate(input: GenerateCodeInput): Promise<InvitationCode> {
    const { data } = await http.post('/api/admin/invitations/generate', input)
    return data
  },

  async getAll(): Promise<InvitationCode[]> {
    const { data } = await http.get('/api/admin/invitations')
    return data
  },

  async deactivate(id: string): Promise<InvitationCode> {
    const { data } = await http.patch(`/api/admin/invitations/${id}/deactivate`)
    return data
  },

  async joinOrganization(code: string): Promise<{ organizationName: string }> {
    const { data } = await http.post('/api/invitations/join-organization', { code })
    return data
  },
}
