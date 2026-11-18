/**
 * Seeded e2e fixtures — IDs must stay in sync with backend/scripts/seed-e2e.ts
 */

export const API_URL = 'http://localhost:3000'

export const USERS = {
  admin: { email: 'e2e-admin@skol.test', password: 'E2eAdminPass123!', appUserId: 'e2e00000-0000-4000-8000-00000000a001', displayName: 'E2E Admin' },
  player1: { email: 'e2e-player1@skol.test', password: 'E2ePlayerPass123!', appUserId: 'e2e00000-0000-4000-8000-00000000b001', displayName: 'E2E Player One' },
  player2: { email: 'e2e-player2@skol.test', password: 'E2ePlayerPass123!', appUserId: 'e2e00000-0000-4000-8000-00000000b002', displayName: 'E2E Player Two' },
  player3: { email: 'e2e-player3@skol.test', password: 'E2ePlayerPass123!', appUserId: 'e2e00000-0000-4000-8000-00000000b003', displayName: 'E2E Player Three' },
  player4: { email: 'e2e-player4@skol.test', password: 'E2ePlayerPass123!', appUserId: 'e2e00000-0000-4000-8000-00000000b004', displayName: 'E2E Player Four' },
} as const

export const CHAMPIONSHIP_ID = 'e2e00000-0000-4000-8000-00000000f001'
export const SEASON_ID = 'e2e00000-0000-4000-8000-00000000f002'
export const CHAMP_MATCH_ID = 'e2e00000-0000-4000-8000-00000000e001'

export const ADMIN_STATE = 'e2e/.auth/admin.json'
export const PLAYER_STATE = 'e2e/.auth/player.json'
export const PLAYER2_STATE = 'e2e/.auth/player2.json'
