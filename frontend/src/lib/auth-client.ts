/**
 * Configuration Better Auth Client
 */

import { createAuthClient } from 'better-auth/vue'
import { genericOAuthClient } from 'better-auth/client/plugins'

const baseURL = import.meta.env.MODE === 'dev' ? 'http://localhost:3000' : window.location.origin;

export const authClient = createAuthClient({
  baseURL,
  plugins: [
    genericOAuthClient()
  ]
})

export const { signIn, signUp, signOut, useSession } = authClient
