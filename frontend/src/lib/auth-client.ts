/**
 * Configuration Better Auth Client
 */

import { createAuthClient } from 'better-auth/vue'

const baseURL = import.meta.env.MODE === 'dev' ? 'http://localhost:3000' : window.location.origin

export const authClient = createAuthClient({
  baseURL,
})

export const { signIn, signUp, signOut, useSession } = authClient
