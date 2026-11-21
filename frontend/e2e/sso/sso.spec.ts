import { test, expect, type Page } from '@playwright/test'
import { API_URL, SSO_INVITATION_CODE } from '../fixtures'
import { currentProvider, SSO_USERS } from './providers'

/**
 * Single sign-on through a real identity provider (SSO_PROVIDER), from the button on
 * the login page to the IdP and back. Runs on a freshly seeded database: the newcomer
 * account does not exist yet.
 */

const provider = currentProvider()
const APP = 'http://localhost:5173'

async function signInThroughProvider(page: Page, username: string) {
  await page.getByRole('button', { name: provider.label }).click()
  await page.waitForURL((url) => !url.href.startsWith(APP))
  await provider.signIn(page, username)
  await page.waitForURL(`${APP}/`)
}

async function linkedProviders(page: Page): Promise<string[]> {
  const res = await page.request.get(`${API_URL}/api/auth/list-accounts`)
  expect(res.ok()).toBe(true)
  return ((await res.json()) as { providerId: string }[]).map((a) => a.providerId).sort()
}

test.describe.configure({ mode: 'serial' })

test(`the login page offers ${provider.id}`, async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('button', { name: provider.label })).toBeVisible()
})

test('a newcomer signs up with an invitation code', async ({ page }) => {
  await page.goto(`/signup?code=${SSO_INVITATION_CODE}`)
  await expect(page.getByRole('button', { name: provider.label })).toBeVisible()

  await signInThroughProvider(page, SSO_USERS.newcomer.username)

  // The code left in the cookie was consumed on account creation: straight in, no
  // detour through /submit-invitation.
  await expect(page.getByRole('button', { name: 'Menu utilisateur' })).toBeVisible()
  await expect(page).not.toHaveURL(/submit-invitation/)
  expect(await linkedProviders(page)).toEqual([provider.id])
})

test('an existing player is linked to the identity sharing their email', async ({ page }) => {
  await page.goto('/login')
  // KEYCLOAK_* keeps the Better Auth 1.6 redirect URI, which the backend forwards.
  const legacyCallback =
    provider.id === 'keycloak'
      ? page.waitForRequest((r) => r.url().includes('/api/auth/oauth2/callback/keycloak'))
      : null

  await signInThroughProvider(page, SSO_USERS.linked.username)
  await legacyCallback

  await expect(page.getByRole('button', { name: 'Menu utilisateur' })).toBeVisible()
  expect(await linkedProviders(page)).toEqual(['credential', provider.id].sort())
})

test('logging out ends the identity provider session too', async ({ page }) => {
  await page.goto('/login')
  await signInThroughProvider(page, SSO_USERS.linked.username)

  // With RP-initiated logout the IdP sends the browser back to /login: a real document
  // request, unlike the in-app router.replace('/login') that runs meanwhile.
  const backFromIdp = provider.providerLogout
    ? page.waitForRequest((r) => r.isNavigationRequest() && r.url() === `${APP}/login`)
    : null
  await page.getByRole('button', { name: 'Menu utilisateur' }).click()
  await page.getByText('Se déconnecter').click()
  await backFromIdp
  await page.waitForURL(`${APP}/login`)
  await expect(page.getByRole('button', { name: provider.label })).toBeVisible()

  // Signed out of Skol Arena…
  const session = await page.request.get(`${API_URL}/api/auth/get-session`)
  expect(await session.json()).toBeNull()

  // …and of the IdP: the next SSO attempt asks for credentials again instead of coming
  // straight back. Dex keeps no session of its own, so it always asks.
  await page.getByRole('button', { name: provider.label }).click()
  await page.waitForURL((url) => !url.href.startsWith(APP))
  await provider.signIn(page, SSO_USERS.linked.username)
  await page.waitForURL(`${APP}/`)
})
