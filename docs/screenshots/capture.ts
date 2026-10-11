/**
 * Captures the product screenshots used on the docs landing page.
 *
 * Prerequisites (see README.md in this folder):
 *   1. docker compose up -d --wait          (Postgres on :5436)
 *   2. backend seeded with scripts/seed-showcase.ts, running on :3000
 *   3. frontend dev server running on :5173
 *
 * Then, from docs/:  bun run shots:capture
 *
 * Every screen is captured twice, at a desktop and at a phone viewport, because
 * the app renders genuinely different components below 768px rather than
 * reflowing one layout. The landing page shows the phone inline and puts the
 * desktop one behind the click-to-zoom view, so the two files always have to be
 * regenerated together.
 */

import { chromium, type Browser, type Page } from 'playwright-core'
import { Client } from 'pg'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_URL = 'http://localhost:5173'
const API_URL = 'http://localhost:3000'
const CONNECTION = 'postgres://skolarena:skolarena@localhost:5436/skolarena_showcase'
const OUT_DIR = fileURLToPath(new URL('../src/assets/screenshots', import.meta.url))

const ACCOUNT = { email: 'theo@skol.demo', password: 'ShowcasePass123!' }

/** Desktop is 16:10; the phone is a 390pt viewport, both at 2x for retina. */
const DEVICES = {
  desktop: { width: 1440, height: 900, screen: { width: 1920, height: 1080 }, isMobile: false },
  mobile: { width: 390, height: 844, screen: { width: 390, height: 844 }, isMobile: true },
} as const

type DeviceName = keyof typeof DEVICES

// ---------------------------------------------------------------------------
// Seeded ids
// ---------------------------------------------------------------------------

async function resolveTargets() {
  const client = new Client({ connectionString: CONNECTION })
  await client.connect()

  const one = async (sql: string, params: unknown[] = []) => {
    const { rows } = await client.query(sql, params)
    if (!rows[0]) throw new Error(`No row for: ${sql}`)
    return rows[0] as Record<string, string>
  }

  const summer = await one(`select id from tournaments where name = 'Summer League 2026'`)
  const season = await one(`select id from tournaments where name = 'Ranked Season 4'`)
  const cup = await one(`select id from tournaments where name = 'Friday Night Cup'`)
  const theo = await one(`select id from app_users where display_name = 'Theo Marchand'`)
  // The one match still waiting on its opponent: that is the screen the
  // "players confirm their own results" section is about.
  const pending = await one(
    `select id from matches where status = 'reported' order by played_at desc limit 1`,
  )

  await client.end()
  return {
    summerId: summer.id,
    seasonId: season.id,
    cupId: cup.id,
    theoId: theo.id,
    pendingMatchId: pending.id,
  }
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/** Signs in through the Better Auth endpoint and returns the session cookies. */
async function signIn(browser: Browser) {
  const context = await browser.newContext({ baseURL: API_URL })
  const response = await context.request.post('/api/auth/sign-in/email', {
    data: ACCOUNT,
  })
  if (!response.ok()) {
    throw new Error(`Sign-in failed (${response.status()}) for ${ACCOUNT.email}`)
  }
  const state = await context.storageState()
  await context.close()
  return state
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

type Shot = {
  name: string
  path: string
  /** Anything that must be on screen before the shutter fires. */
  waitFor?: string
  /** Extra settling time for charts and count-up animations, in ms. */
  settle?: number
}

async function capture(page: Page, shot: Shot, device: DeviceName) {
  await page.goto(`${APP_URL}${shot.path}`, { waitUntil: 'networkidle' })
  if (shot.waitFor) {
    await page.waitForSelector(shot.waitFor, { timeout: 15_000, state: 'visible' })
  }
  await page.waitForTimeout(shot.settle ?? 900)

  // Screens shorter than the viewport would otherwise be padded with dead space
  // under the content, which reads as a broken page once it sits in a device
  // frame. Taller ones are cut at the viewport rather than scrolled: a 4000px
  // tall strip is not a screenshot.
  //
  // scrollHeight is useless for this: the app root stretches to the viewport, so
  // it always reports at least a full screen. Only leaf elements say where the
  // content actually stops.
  const { width, height } = DEVICES[device]
  const contentBottom = await page.evaluate(() => {
    let bottom = 0
    const walk = (element: Element) => {
      for (const child of element.children) {
        const style = getComputedStyle(child)
        if (style.display === 'none' || style.visibility === 'hidden') continue
        if (child.childElementCount === 0) {
          const rect = child.getBoundingClientRect()
          if (rect.height > 0 && rect.width > 0) bottom = Math.max(bottom, rect.bottom)
        } else {
          walk(child)
        }
      }
    }
    walk(document.body)
    return Math.ceil(bottom)
  })
  const clipHeight = Math.min(
    height,
    Math.max(contentBottom + 32, Math.round(height * 0.5)),
  )

  const file = join(OUT_DIR, `${shot.name}-${device}.png`)
  await page.screenshot({
    path: file,
    scale: 'device',
    clip: { x: 0, y: 0, width, height: clipHeight },
  })
  console.log(`  ${shot.name}-${device}.png (${width}x${clipHeight})`)
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  const targets = await resolveTargets()
  const shots: Shot[] = [
    { name: 'tournaments', path: '/' },
    { name: 'standings', path: `/tournaments/${targets.summerId}/standings` },
    { name: 'ranked', path: `/tournaments/${targets.seasonId}/standings` },
    { name: 'bracket', path: `/tournaments/${targets.cupId}/bracket` },
    { name: 'player', path: `/players/${targets.theoId}` },
    { name: 'match', path: `/matches/${targets.pendingMatchId}` },
    // Both panes of the season's Stats tab. They are one component switched by a
    // query param, and the profile pane only renders for a signed-in participant
    // of a ranked season — which is what the showcase account is.
    { name: 'season-profile', path: `/tournaments/${targets.seasonId}/stats?statsSub=profile`, settle: 1600 },
    { name: 'season-stats', path: `/tournaments/${targets.seasonId}/stats?statsSub=global`, settle: 1600 },
  ]

  const browser = await chromium.launch()
  const storageState = await signIn(browser)

  for (const device of Object.keys(DEVICES) as DeviceName[]) {
    const { width, height, screen, isMobile } = DEVICES[device]
    console.log(`\n${device} (${width}x${height})`)

    const context = await browser.newContext({
      storageState,
      viewport: { width, height },
      screen,
      isMobile,
      hasTouch: isMobile,
      deviceScaleFactor: 2,
      colorScheme: 'dark',
      locale: 'en-GB',
      timezoneId: 'Europe/Paris',
      // The service worker precaches its own copy of the app and serves stale
      // routes back on the second context.
      serviceWorkers: 'block',
    })
    // The app reads its language from localStorage and defaults to French; the
    // docs site is English-only, so the screenshots have to be too.
    await context.addInitScript(() => window.localStorage.setItem('locale', 'en'))
    // A fresh browser has never opened the release notes, so the "What's new"
    // badge would sit on the header avatar in every shot. Mark them as read.
    await context.addInitScript(() =>
      window.localStorage.setItem('skol.whatsNew.seenVersion', '9999.0.0'),
    )
    // The Vue DevTools floating button is injected by the dev server and would
    // sit in the middle of every shot.
    await context.addInitScript(() => {
      const style = document.createElement('style')
      style.textContent = '#vue-devtools-anchor, .vue-devtools__anchor { display: none !important }'
      document.addEventListener('DOMContentLoaded', () => document.head.append(style))
    })

    const page = await context.newPage()
    for (const shot of shots) await capture(page, shot, device)
    await context.close()
  }

  await browser.close()
  console.log(`\nWrote ${shots.length * 2} screenshots to src/assets/screenshots/`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
