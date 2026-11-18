import {
  test,
  expect,
  request,
  type APIRequestContext,
  type Browser,
  type Page,
} from '@playwright/test'
import {
  API_URL,
  USERS,
  CHAMPIONSHIP_ID,
  ADMIN_STATE,
  PLAYER_STATE,
  PLAYER2_STATE,
} from './fixtures'

interface FeedItem {
  id: string
  type: string
  isRead: boolean
  actionUrl: string | null
  translationParams?: Record<string, unknown> | null
}

/** An API client reusing the session `auth.setup.ts` saved — a fresh sign-in per test is refused. */
function apiAs(storageState: string): Promise<APIRequestContext> {
  return request.newContext({ baseURL: API_URL, storageState })
}

async function feed(api: APIRequestContext): Promise<FeedItem[]> {
  const res = await api.get('/api/me/notifications?limit=50')
  expect(res.ok()).toBe(true)
  return ((await res.json()) as { data: FeedItem[] }).data
}

/** The feed copy of the announcement titled `title`, if any. */
async function announcementInFeed(api: APIRequestContext, title: string) {
  const items = await feed(api)
  return items.find((n) => n.type === 'ANNOUNCEMENT' && n.translationParams?.title === title)
}

/**
 * A second browser as another user. `browser.newContext` does not inherit the project's
 * `use` block, so the options the app depends on are repeated here.
 */
async function openAs(browser: Browser, storageState: string): Promise<Page> {
  const context = await browser.newContext({
    storageState,
    baseURL: 'http://localhost:5173',
    locale: 'fr-FR',
    serviceWorkers: 'block',
    screen: { width: 1920, height: 1080 },
    viewport: { width: 1280, height: 800 },
  })
  return context.newPage()
}

const popupTitle = (page: Page) => page.getByTestId('announcement-title')

test.describe('announcements', () => {
  test.use({ storageState: ADMIN_STATE })

  let admin: APIRequestContext
  let player: APIRequestContext

  test.beforeAll(async () => {
    admin = await apiAs(ADMIN_STATE)
    player = await apiAs(PLAYER_STATE)
  })

  // Every announcement goes, whatever the test left behind: a pending app-wide pop-up
  // would cover the pages of the specs that run next.
  test.afterEach(async () => {
    const res = await admin.get('/api/announcements')
    for (const { id } of (await res.json()) as Array<{ id: string }>) {
      await admin.delete(`/api/announcements/${id}`)
    }
  })

  test.afterAll(async () => {
    await admin.dispose()
    await player.dispose()
  })

  test('an app-wide announcement pops up once and its feed copy is read', async ({
    page,
    browser,
  }) => {
    const title = `Maintenance ${Date.now()}`
    const body = 'Le serveur redémarre ce soir à 22h.'

    await page.goto('/admin/announcements')
    await page.getByRole('button', { name: 'Nouvelle annonce' }).click()
    await page.getByLabel('Titre').fill(title)
    await page.getByLabel('Message').fill(body)
    await page.getByRole('button', { name: 'Envoyer' }).click()

    await expect(page.getByText('Annonce envoyée')).toBeVisible()
    await expect(page.getByTestId('announcement-row').filter({ hasText: title })).toBeVisible()

    const playerPage = await openAs(browser, PLAYER_STATE)
    await playerPage.goto('/tournaments')
    await expect(popupTitle(playerPage)).toHaveText(title)
    await expect(playerPage.getByTestId('announcement-body')).toHaveText(body)
    await expect.poll(async () => (await announcementInFeed(player, title))?.isRead).toBe(false)

    await playerPage.getByTestId('announcement-dismiss').click()
    await expect(popupTitle(playerPage)).toBeHidden()
    await expect.poll(async () => (await announcementInFeed(player, title))?.isRead).toBe(true)

    await playerPage.reload()
    await expect(playerPage.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(popupTitle(playerPage)).toBeHidden()
    await playerPage.context().close()
  })

  test("a tournament announcement pops up on that tournament's page only", async ({
    page,
    browser,
  }) => {
    const title = `Finale ${Date.now()}`

    await page.goto(`/tournaments/${CHAMPIONSHIP_ID}`)
    await page.getByRole('button', { name: 'Actions' }).click()
    await page.getByRole('menuitem', { name: 'Annonces' }).click()
    await page.getByRole('button', { name: 'Nouvelle annonce' }).click()
    await page.getByLabel('Titre').fill(title)
    await page.getByLabel('Message').fill('La finale se joue samedi.')
    await page.getByLabel('Dans les notifications').uncheck()
    await page.getByRole('button', { name: 'Envoyer' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByTestId('announcement-row').filter({ hasText: title })).toBeVisible()

    const playerPage = await openAs(browser, PLAYER_STATE)
    await playerPage.goto('/tournaments')
    await expect(playerPage.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(popupTitle(playerPage)).toBeHidden()

    await playerPage.goto(`/tournaments/${CHAMPIONSHIP_ID}`)
    await expect(popupTitle(playerPage)).toHaveText(title)
    await playerPage.getByTestId('announcement-dismiss').click()
    await expect(popupTitle(playerPage)).toBeHidden()

    // Pop-up only: nothing landed in the bell
    expect(await announcementInFeed(player, title)).toBeUndefined()
    await playerPage.context().close()
  })

  test("deleting an announcement takes it out of the players' feed", async ({ page }) => {
    const title = `Rappel ${Date.now()}`
    const res = await admin.post('/api/announcements', {
      data: { title, body: 'Pensez à saisir vos scores.', audience: 'all', inFeed: true, asPopup: false },
    })
    expect(res.status()).toBe(201)
    await expect.poll(async () => announcementInFeed(player, title)).toBeDefined()

    await page.goto('/admin/announcements')
    const row = page.getByTestId('announcement-row').filter({ hasText: title })
    await row.getByRole('button', { name: 'Supprimer' }).click()
    await page.getByRole('alertdialog').or(page.getByRole('dialog'))
      .getByRole('button', { name: 'Supprimer' })
      .click()

    await expect(row).toBeHidden()
    await expect.poll(async () => announcementInFeed(player, title)).toBeUndefined()
  })
})

test.describe('match notifications', () => {
  test.use({ storageState: PLAYER2_STATE })

  test('opening the match marks its "added to a match" notification read', async ({ page }) => {
    const creator = await apiAs(PLAYER_STATE)
    const opponent = await apiAs(PLAYER2_STATE)

    // In the past and on a minute no other spec uses: the API rejects a second match
    // with the same players at the same time.
    const playedAt = new Date(Date.now() - 3 * 60 * 60 * 1000)
    playedAt.setSeconds(0, 0)
    const res = await creator.post('/api/matches', {
      data: {
        tournamentId: CHAMPIONSHIP_ID,
        playedAt: playedAt.toISOString(),
        sides: [
          { position: 1, playerIds: [USERS.player1.appUserId] },
          { position: 2, playerIds: [USERS.player2.appUserId] },
        ],
      },
    })
    expect(res.ok(), `match creation failed: ${res.status()} ${await res.text()}`).toBe(true)
    const { id: matchId } = (await res.json()) as { id: string }

    const matchNotification = async () =>
      (await feed(opponent)).find(
        (n) => n.type === 'MATCH_CREATED' && n.actionUrl === `/matches/${matchId}`,
      )
    await expect.poll(async () => (await matchNotification())?.isRead).toBe(false)

    await page.goto(`/matches/${matchId}`)
    await expect(page.getByText(USERS.player1.displayName).first()).toBeVisible()
    await expect.poll(async () => (await matchNotification())?.isRead).toBe(true)

    await creator.dispose()
    await opponent.dispose()
  })
})
