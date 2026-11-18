import { test as setup, expect, request } from '@playwright/test'
import { API_URL, USERS, ADMIN_STATE, PLAYER_STATE, PLAYER2_STATE } from './fixtures'

/**
 * Logs in via the Better Auth API (faster and more robust than the UI)
 * and saves the session cookie as storageState. The cookie domain is
 * `localhost` (port-agnostic), so the app on :5173 sends it to :3000.
 */
async function saveState(email: string, password: string, path: string) {
  const ctx = await request.newContext({ baseURL: API_URL })
  const res = await ctx.post('/api/auth/sign-in/email', {
    data: { email, password },
  })
  expect(res.ok(), `login failed for ${email}: ${res.status()}`).toBe(true)
  await ctx.storageState({ path })
  await ctx.dispose()
}

setup('authenticate player1', async () => {
  await saveState(USERS.player1.email, USERS.player1.password, PLAYER_STATE)
})

setup('authenticate player2', async () => {
  await saveState(USERS.player2.email, USERS.player2.password, PLAYER2_STATE)
})

setup('authenticate admin', async () => {
  await saveState(USERS.admin.email, USERS.admin.password, ADMIN_STATE)
})
