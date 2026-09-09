import { defineConfig, devices } from '@playwright/test'

const E2E_DATABASE_URL = 'postgres://skolarena:skolarena@localhost:5435/skolarena_e2e'

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // Shared DB + specs that mutate state: sequential execution
  workers: 1,
  fullyParallel: false,
  timeout: 30_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    // Disables the PWA service worker (dev-dist) during runs
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // useViewport tests screen.width/height < 768: the default headless
        // screen (1280x720) would switch the app to the mobile variant
        screen: { width: 1920, height: 1080 },
        viewport: { width: 1280, height: 800 },
        storageState: 'e2e/.auth/player.json',
      },
      dependencies: ['setup'],
    },
  ],
  webServer: [
    {
      // The dev frontend hardcodes http://localhost:3000 (ApiConfig):
      // the e2e backend MUST own this port — stop the dev stack first.
      command: 'bun run src/index.ts',
      cwd: '../backend',
      url: 'http://localhost:3000/',
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        DATABASE_URL: E2E_DATABASE_URL,
        BETTER_AUTH_SECRET: 'e2e-secret-at-least-32-characters!!',
        BETTER_AUTH_URL: 'http://localhost:3000',
        NODE_ENV: 'development',
        SHOW_EMAIL_PASSWORD_FORM: 'true',
        LOG_LEVEL: 'warn',
        // Disables Keycloak SSO which backend/.env might enable
        // (dotenv doesn't override variables that are already set)
        KEYCLOAK_CLIENT_ID: '',
        KEYCLOAK_CLIENT_SECRET: '',
        KEYCLOAK_ISSUER: '',
      },
    },
    {
      // Direct binary: `bun x` can hang when the backend is spawned in parallel
      command: './node_modules/.bin/vite --mode dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        VITE_E2E: '1',
      },
    },
  ],
})
