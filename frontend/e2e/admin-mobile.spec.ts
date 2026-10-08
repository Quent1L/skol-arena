import { test, expect, type Page } from '@playwright/test'
import { ADMIN_STATE, CHAMPIONSHIP_ID, SEASON_ID } from './fixtures'

// A phone: viewport and screen both, since useViewport reads the screen size.
test.use({
  storageState: ADMIN_STATE,
  viewport: { width: 390, height: 844 },
  screen: { width: 390, height: 844 },
  hasTouch: true,
})

const ADMIN_PAGES = [
  '/admin',
  '/admin/tournaments',
  `/admin/tournaments/${CHAMPIONSHIP_ID}/edit`,
  '/admin/disciplines',
  '/admin/ranked',
  '/admin/ranked/new',
  `/admin/ranked/${SEASON_ID}/tiers`,
  '/admin/rules',
  '/admin/rules-engine',
  '/admin/rules-engine/new',
  '/admin/users',
  '/admin/organizations',
  '/admin/invitations',
  '/admin/maintenance',
]

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
}

for (const path of ADMIN_PAGES) {
  test(`${path} does not scroll sideways on a phone`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })
}

test('the admin menu opens as a drawer and navigates', async ({ page }) => {
  await page.goto('/admin')
  await page.getByRole('button', { name: 'Ouvrir le menu' }).click()

  const drawer = page.getByRole('dialog', { name: "Menu d'administration" })
  await drawer.getByRole('link', { name: 'Règles du jeu' }).click()

  await expect(page).toHaveURL('/admin/rules')
  await expect(drawer).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Gestion des règles du jeu' })).toBeVisible()
})

test('a game rule can be created and deleted from a phone', async ({ page }) => {
  const title = `Règlement mobile ${Date.now()}`

  await page.goto('/admin/rules/new')
  await page.getByRole('button', { name: 'Créer' }).click()
  await expect(page.getByText('Le contenu est requis')).toBeVisible()

  await page.getByLabel('Titre').fill(title)
  await page.locator('[contenteditable="true"]').click()
  await page.keyboard.type('Une partie se joue en deux manches gagnantes.')
  await page.getByRole('button', { name: 'Créer' }).click()

  await expect(page).toHaveURL('/admin/rules')
  const row = page.getByRole('row', { name: new RegExp(title) })
  await expect(row).toBeVisible()

  await row.getByRole('button', { name: 'Actions' }).click()
  await page.getByRole('menuitem', { name: 'Supprimer' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click()

  await expect(row).toBeHidden()
})
