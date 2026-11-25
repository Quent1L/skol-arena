import { test, expect } from '@playwright/test'
import { USERS, NWAY_CHAMPIONSHIP_ID } from './fixtures'

test('creates a 1v1v1 match ranked from its scores', async ({ page }) => {
  await page.goto(`/tournaments/${NWAY_CHAMPIONSHIP_ID}/create-match`)

  await page.getByRole('button', { name: 'Maintenant' }).click()
  await page.getByRole('button', { name: 'Suivant' }).click()

  // The logged-in player (player1) is auto-selected; a solo 3-side competition takes two more.
  for (const player of [USERS.player2, USERS.player3]) {
    await page
      .getByPlaceholder('Rechercher un joueur...')
      .fill(player.displayName.split(' ').pop()!)
    await page.getByRole('option', { name: player.displayName }).click()
  }
  await page.getByRole('button', { name: 'Suivant' }).click()

  // Composition: a solo roster starts as one side per player.
  await expect(page.getByTestId('compose-side')).toHaveCount(3)
  await page.getByRole('button', { name: 'Suivant' }).click()

  // Result: the scores set the finishing order.
  await page.getByLabel("Score de l'équipe 1").fill('2')
  await page.getByLabel("Score de l'équipe 2").fill('7')
  await page.getByLabel("Score de l'équipe 3").fill('4')
  await page.getByLabel("Score de l'équipe 3").blur()
  await expect(page.getByTestId('ranking-place')).toHaveText(['1', '2', '3'])
  await expect(page.getByTestId('ranking-row').first()).toContainText(USERS.player2.displayName)

  await page.getByRole('button', { name: 'Créer le match' }).click()
  await expect(page).toHaveURL(new RegExp(`/tournaments/${NWAY_CHAMPIONSHIP_ID}/standings`), {
    timeout: 15_000,
  })

  // Placement points (5 / 3 / 1): player2 first with 5, player1 last with 1.
  const row = (name: string) => page.getByRole('link', { name: new RegExp(name) })
  await expect(row(USERS.player2.displayName)).toContainText(/1 match.*\D5(pts)?$/)
  await expect(row(USERS.player3.displayName)).toContainText(/1 match.*\D3(pts)?$/)
  await expect(row(USERS.player1.displayName)).toContainText(/1 match.*\D1(pts)?$/)
})
