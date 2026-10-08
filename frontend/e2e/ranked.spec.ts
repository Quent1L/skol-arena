import { test, expect } from '@playwright/test'
import { USERS, SEASON_ID, ADMIN_STATE } from './fixtures'

test('the leaderboard groups players by rank, from highest to lowest', async ({ page }) => {
  await page.goto(`/tournaments/${SEASON_ID}`)

  await expect(page.getByText(USERS.player1.displayName).first()).toBeVisible()
  await expect(page.getByText('1550').first()).toBeVisible()

  // Diamond (1550) above Bronze (850)
  const content = await page.locator('.leaderboard').innerText()
  expect(content.indexOf('Diamond')).toBeGreaterThan(-1)
  expect(content.indexOf('Bronze')).toBeGreaterThan(-1)
  expect(content.indexOf('Diamond')).toBeLessThan(content.indexOf('Bronze'))
  expect(content.indexOf(USERS.player1.displayName)).toBeLessThan(
    content.indexOf(USERS.player3.displayName),
  )
})

test('the provisional toggle includes non-finalized matches', async ({ page }) => {
  await page.goto(`/tournaments/${SEASON_ID}`)
  await expect(page.getByText(USERS.player1.displayName).first()).toBeVisible()

  // player4 is still in placement (3 of 5 matches) and has a "reported" match that
  // is not finalized: only the provisional view counts it. A player in placement
  // shows their progress rather than an MMR.
  const leaderboard = page.locator('.leaderboard')
  const player4Row = leaderboard.locator('a', { hasText: USERS.player4.displayName })
  await expect(player4Row).toContainText('3/5')

  await page.locator('[data-test="subtab-provisional"]').click()
  await expect(player4Row).toContainText('4/5')
})

test('the MMR profile shows rank, MMR and history', async ({ page }) => {
  await page.goto(`/players/${USERS.player1.appUserId}?tournamentId=${SEASON_ID}`)

  await expect(page.getByText(USERS.player1.displayName).first()).toBeVisible()
  // MMR formatted fr-FR: "1 550" (narrow no-break space)
  await expect(page.getByText(/1[\s  ]?550/).first()).toBeVisible()
  await expect(page.getByText('Diamond').first()).toBeVisible()
  // Seeded history: +26 then +24
  await expect(page.getByText('+26').first()).toBeVisible()
  await expect(page.getByText('+24').first()).toBeVisible()
})

test.describe('admin ranked', () => {
  test.use({ storageState: ADMIN_STATE })

  test('the seeded season appears in the admin list', async ({ page }) => {
    await page.goto('/admin/ranked')
    await expect(page.getByText('E2E Season').first()).toBeVisible()
  })

  test('the ranks page lists the 5 tiers', async ({ page }) => {
    await page.goto(`/admin/ranked/${SEASON_ID}/tiers`)
    for (const tier of ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond']) {
      await expect(page.getByText(tier).first()).toBeVisible()
    }
  })
})
