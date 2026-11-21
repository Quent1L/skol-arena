import { defineConfig, devices } from '@playwright/test'
import base from './playwright.config'
import { currentProvider } from './e2e/sso/providers'

/**
 * The SSO suite (e2e/sso) against one identity provider, picked by SSO_PROVIDER.
 * Started by `bun run test:e2e:sso <provider>`, which boots the IdP first.
 */
const provider = currentProvider()
const servers = Array.isArray(base.webServer) ? base.webServer : []

export default defineConfig({
  ...base,
  testDir: './e2e/sso',
  testIgnore: [],
  globalSetup: undefined,
  // An IdP round trip is slower than an in-app navigation.
  timeout: 60_000,
  projects: [
    {
      name: `sso-${provider.id}`,
      use: {
        ...devices['Desktop Chrome'],
        contextOptions: { screen: { width: 1920, height: 1080 } },
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: servers.map((server) =>
    server.cwd === '../backend' ? { ...server, env: { ...server.env, ...provider.env } } : server,
  ),
})
