import { expect, type Page } from '@playwright/test'

/**
 * The identity providers of e2e/sso/docker-compose.yml, as the suite drives them.
 * Each one is provisioned with the same client (skol-arena / skol-e2e-secret) and the
 * same two users, password SSO_PASSWORD.
 */

export const SSO_PASSWORD = 'SsoE2ePass123!'
export const SSO_USERS = {
  /** No Skol Arena account yet: signs up with the invitation code. */
  newcomer: { username: 'sso-new', email: 'sso-new@skol.test' },
  /** Same email as the seeded native player4: the sign-in links to that account. */
  linked: { username: 'sso-link', email: 'e2e-player4@skol.test' },
} as const

export interface SsoProvider {
  id: string
  /** Label configured on the button (OIDC_<ID>_LABEL / KEYCLOAK_LOGIN_LABEL). */
  label: string
  issuer: string
  /** Backend environment declaring the provider. */
  env: Record<string, string>
  /** Whether the IdP publishes an end_session_endpoint (RP-initiated logout). */
  providerLogout: boolean
  /** Fills the IdP's login form; the page is on the IdP when called. */
  signIn(page: Page, username: string): Promise<void>
}

const CLIENT = { id: 'skol-arena', secret: 'skol-e2e-secret' }

function oidcEnv(id: string, issuer: string, label: string): Record<string, string> {
  const prefix = `OIDC_${id.toUpperCase()}_`
  return {
    OIDC_PROVIDERS: id,
    [`${prefix}ISSUER`]: issuer,
    [`${prefix}CLIENT_ID`]: CLIENT.id,
    [`${prefix}CLIENT_SECRET`]: CLIENT.secret,
    [`${prefix}LABEL`]: label,
  }
}

const keycloakIssuer = 'http://localhost:8080/realms/skol'
const dexIssuer = 'http://localhost:5556/dex'
const authentikIssuer = 'http://localhost:9100/application/o/skol-arena'

export const PROVIDERS: Record<string, SsoProvider> = {
  // Declared through the deprecated KEYCLOAK_* variables on purpose: proves an existing
  // install keeps working, callback URL from Better Auth 1.6 included.
  keycloak: {
    id: 'keycloak',
    label: 'Keycloak e2e',
    issuer: keycloakIssuer,
    env: {
      KEYCLOAK_ISSUER: keycloakIssuer,
      KEYCLOAK_CLIENT_ID: CLIENT.id,
      KEYCLOAK_CLIENT_SECRET: CLIENT.secret,
      KEYCLOAK_LOGIN_LABEL: 'Keycloak e2e',
    },
    providerLogout: true,
    async signIn(page, username) {
      await page.locator('#username').fill(username)
      await page.locator('#password').fill(SSO_PASSWORD)
      await page.locator('#kc-login').click()
    },
  },
  dex: {
    id: 'dex',
    label: 'Dex e2e',
    issuer: dexIssuer,
    env: oidcEnv('dex', dexIssuer, 'Dex e2e'),
    providerLogout: false,
    async signIn(page, username) {
      // Dex's local connector signs in by email, not by username.
      const email = Object.values(SSO_USERS).find((u) => u.username === username)!.email
      await page.locator('#login').fill(email)
      await page.locator('#password').fill(SSO_PASSWORD)
      await page.locator('#submit-login').click()
    },
  },
  authentik: {
    id: 'authentik',
    label: 'Authentik e2e',
    issuer: authentikIssuer,
    env: oidcEnv('authentik', authentikIssuer, 'Authentik e2e'),
    providerLogout: true,
    async signIn(page, username) {
      // Default authentication flow: identification, then password on a second step.
      // Enter does not submit its web-component form: click the button.
      await page.locator('input[name="uidField"]').fill(username)
      await page.getByRole('button', { name: /^(Se connecter|Log in)$/ }).click()
      // The password stage is rendered once its "Not you?" banner names the user; a
      // field filled before that is replaced, value lost.
      await page.getByRole('banner').getByText(username, { exact: true }).waitFor()
      const password = page.locator('input[name="password"]')
      await expect(async () => {
        await password.fill(SSO_PASSWORD)
        await expect(password).toHaveValue(SSO_PASSWORD, { timeout: 500 })
      }).toPass()
      await page.getByRole('button', { name: /^(Continuer|Continue)$/ }).click()
    },
  },
}

export function currentProvider(): SsoProvider {
  const id = process.env.SSO_PROVIDER ?? ''
  const provider = PROVIDERS[id]
  if (!provider) {
    throw new Error(
      `SSO_PROVIDER must be one of ${Object.keys(PROVIDERS).join(', ')} (got "${id}")`,
    )
  }
  return provider
}
